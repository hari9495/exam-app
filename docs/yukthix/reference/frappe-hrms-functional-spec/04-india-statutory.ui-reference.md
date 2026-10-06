# 04 · India Statutory — UI Reference

> **Purpose.** How Frappe HR and the India Payroll app lay out the statutory screens (PF, ESI, PT, LWF, TDS challans and returns, Form 16, statutory IDs), as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [04-india-statutory.md](04-india-statutory.md) (behaviour) and [04-india-statutory.data-dictionary.md](04-india-statutory.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 16 screenshots in [`../ui-screens/04-india-statutory/`](../ui-screens/04-india-statutory/). The regime selector is reused from module 03 ([24](../ui-screens/03-payroll/24-tax-regime-selector.png)). Internal reference only. There are no mobile statutory screens in Frappe.

## Demo data behind the screenshots

This module uses the September 2026 payroll run from [module 03](03-payroll-engine.ui-reference.md). On top of it, the demo adds the following. All identifiers are **dummy values**.

| Item | Setup |
|---|---|
| Company | TAN, deductor type "Company", responsible person (Vikram Iyer, HR Manager). |
| Employees | PAN, UAN, bank account and IFSC. Rahul has an ESIC number and **no PAN**, on purpose. |
| Statutory switches | EPF, ESIC, PT and **LWF** on. PT state per salary assignment: Telangana or Tamil Nadu. |
| TDS challan | September, ₹47,824, deposited 7 Oct. |
| Form 24Q (Q2 FY 2026-27) | Created with "Fetch from Payroll". |
| Form 16 | A draft for Ananya. |

**Statutory results in September:**

| Statute | Result |
|---|---|
| EPF | 12 % of PF wages, capped at ₹15,000, for all 6 employees. EPS wages only for Rahul (the others' wages are above the EPS ceiling). |
| ESI | Only Rahul (gross ₹20,000 ≤ ₹21,000): employee ₹150, employer ₹650. |
| PT | Telangana ₹200 (₹150 for Rahul's slab). Tamil Nadu half-yearly ₹1,250 for Priya. |
| LWF | Not due in September (annual in both states). |
| TDS | ₹47,823.71 (Ananya ₹39,650 + Vikram ₹8,173.71). |

---

## 1. Screen-by-screen

### 1.1 Where statutory lives — settings [01](../ui-screens/04-india-statutory/01-payroll-settings-statutory.png), company [02](../ui-screens/04-india-statutory/02-company-deductor.png), employee [03](../ui-screens/04-india-statutory/03-employee-statutory-ids.png), assignment [04](../ui-screens/04-india-statutory/04-ssa-india-payroll-tab.png)

Statutory set-up is scattered across **four different records**:

| Record | What it holds |
|---|---|
| **Payroll Settings** | On/off switches for EPF, ESIC, PT, LWF, TDS filing (with API credentials and a sandbox flag), multi-company table with registration numbers. |
| **Company** | A collapsible "TDS Deductor Details" section (TAN, deductor type, responsible person), buried among ERPNext accounting tabs. The deductor **PAN is the generic "Tax ID" field** on the Details tab. |
| **Employee** | Statutory IDs (UAN, PF name, ESIC number, PAN) sit in a **collapsed "India Payroll" section on the Salary tab**. Bank details show bank, account and **IBAN**. **IFSC, which Indian payroll needs, is not in the visible bank section.** |
| **Salary assignment**, India Payroll tab | Person with disability (ESIC ceiling ₹25,000), LWF exempted, EPF applicable, contribute on actual PF wage, VPF mode and amount. |

**Observed:**
- Validating the TDS return reported **12+ missing deductor fields**: PAN, branch, address lines, city, state, PIN, email, responsible person's address. None of these were asked for when TDS was switched on. Our full-page capture of the Company form ran to its 8,000-pixel limit; the screen is a long accounting form.
- Rahul has no PAN, and **nothing warns about it**: not on the employee, the slip or the TDS return. (The 206AA higher-rate rule only bites once TDS is non-zero, but the gap is invisible.)

**YukthiX:** a single **Statutory set-up** area, per legal entity:
1. **Registrations** (a card per statute): PF establishment code, ESIC code, PT and LWF per state, TAN, PAN, deductor address and responsible person. Each card shows "Complete" or "Missing: …".
2. **Coverage rules:** who is covered by PF/ESI/PT/LWF, with the defaults the law sets.

On the employee profile, show a **Statutory tab**: PAN (validated format + name match), UAN, ESIC, IFSC and bank (validated), with a **completeness score across the company** ("4 employees missing UAN").

### 1.2 Statutory lines on the payslip — [05](../ui-screens/04-india-statutory/05-salary-slip-statutory-deductions.png)
- **Layout:** deductions grid (Income Tax 0, Professional Tax 150, Provident Fund 1,200, Employee State Insurance 150). **Employer contributions** sit in a collapsed section below.
- **YukthiX:** statutory lines are marked with a small "statutory" tag and a tooltip showing the rule ("PF: 12 % of ₹10,000 PF wage"). Employer contributions are shown in a "Your employer also paid" box: they help the employee understand CTC.

### 1.3 Monthly registers — EPF [06](../ui-screens/04-india-statutory/06-report-epf-register.png), ESIC [07](../ui-screens/04-india-statutory/07-report-esic-register.png), LWF [08](../ui-screens/04-india-statutory/08-report-lwf-register.png)
- **Layout:** these are India Payroll's own reports.
  - Filters: company, year, month, contribution period (Apr–Sep / Oct–Mar), plus coverage or deduction status.
  - Header buttons for the filing file: **"Download ECR Text File"** (EPF), **"Export for ESIC Portal"**, **"Export for LWF Remittance"**.
  - Grids: UAN/IP number, wages (gross, PF, EPS, EDLI), contributions, totals row.
- **Observed:**
  - **Good:** each register leads straight to the government upload file, and the numbers matched the slips.
  - EPF "Name as per UAN" is blank. The screen doesn't flag that, though the portal will reject a mismatch.
  - The ESIC register lists **all** employees, including the 5 not covered (₹0), with no "not covered" label.
  - The LWF register shows every row as a grey "Non-…" status pill that is truncated off-screen ("non-deduction month").
  - Wide grids; key columns (contribution, total) are off-screen on a laptop.
- **YukthiX:** a **monthly statutory checklist** after each payroll run (links to run step 7, [module 03 §1.5](03-payroll-engine.ui-reference.md)). A card per statute:
  - Amount due and due date ("PF ₹…, due 15 Oct").
  - Employees included and excluded, with the reason ("5 not covered: wages above ₹21,000").
  - Data problems ("1 missing UAN name").
  - **Generate file → mark paid (challan no. / date) → attach receipt.**

  Include a status history per month (Due → File generated → Paid → Receipt uploaded).

### 1.4 Deduction reports — PT [09](../ui-screens/04-india-statutory/09-report-pt-deductions.png), PF [10](../ui-screens/04-india-statutory/10-report-pf-deductions.png), income tax [11](../ui-screens/04-india-statutory/11-report-income-tax-deductions.png), bank remittance [12](../ui-screens/04-india-statutory/12-report-bank-remittance.png), bank mandate [13](../ui-screens/04-india-statutory/13-report-bank-mandate.png)

| Report | Result on the instance |
|---|---|
| Income tax deductions | Works: per employee PAN, component, TDS amount, gross, posting date. Rahul's blank PAN is shown without comment. |
| **PT deductions** | **"Nothing to show"**, even though PT was deducted from all 6 slips. |
| **PF deductions** | **"Nothing to show"**, even though PF was deducted from all 6 slips. |
| Bank remittance | "Nothing to show". It depends on a bank payment entry that we did not make. |
| Bank mandate | Works: employee, bank, account, IFSC, MICR. |

**Observed:** there are **two overlapping report sets**: core Frappe HR (PF/PT/IT deductions, bank remittance) and India Payroll (registers, bank mandate). The core PF and PT reports come up empty with India Payroll's set-up. They appear to rely on a component-type tag that India Payroll's components do not carry. Either way, a user sees contradictory reports in the same menu.

**YukthiX:** one report per purpose. Statutory amounts come only from the registers (§1.3). Bank payout is covered by the run's "Pay" step (bank file + payout status).

### 1.5 TDS challan — [14](../ui-screens/04-india-statutory/14-tds-challan.png)
- **Layout:**
  - Company, TAN | financial year, quarter, deduction month (with help: "defaults to the month before the challan date"), section 192.
  - Challan details: deposit date, BSR code (7 digits), serial number, payment mode, bank | total deposited, minor head (200).
  - Amount breakup: TDS, surcharge, cess | interest, fee (234E), others.
- **Observed:**
  - HR copies the challan data by hand from the bank or tax-portal receipt.
  - The TDS amount is not pre-filled from payroll; our script calculated it.
  - Interest and fee for late payment are not computed.
- **YukthiX:** challan is a step in the monthly checklist:
  - Amount due pre-filled from the run (₹47,824).
  - Due date and late-interest preview.
  - After paying, the user **uploads the challan PDF** and YukthiX reads BSR, serial and date (AI-assisted, confirmed by the user).

### 1.6 TDS return (Form 24Q) — [15](../ui-screens/04-india-statutory/15-tds-return.png)
- **Layout:** one long page.
  - Status stats.
  - Company, TAN | FY, quarter, form type.
  - Filing: return type, filing status.
  - Collapsed deductor & responsible person.
  - **Deductor address** (8 fields) and **responsible person contact** (11 fields), repeated on every return.
  - A **deductee grid**: employee, PAN, month, amount paid, tax deducted, challan.
  - Totals: amount paid ₹3,70,000, tax deducted ₹47,823.71 | tax deposited ₹47,824 (the ₹0.29 rounding difference is not flagged).
  - Generated files (collapsed).
  - Header: **Fetch from Payroll**, **File Return ▾** (validate, TXT, FVU, e-file through a provider), Submit.
- **Observed:**
  - **Q2 contains only September.** July and August were brought in as opening balances (module 03), so they **are not in the return**. A company switching mid-quarter would file an incomplete return.
  - Only employees with TDS > 0 appear. Correct for the quarterly annexure, but there's no view of "who was paid but had no TDS".
  - The deductor and responsible-person addresses are typed per return instead of coming from the company.
  - E-filing needs a paid external provider account (API key/secret in Payroll Settings, sandbox mode).
- **YukthiX:** a **quarterly return wizard**:
  1. Data completeness (PAN, challans matched, opening balances **imported as prior-month deductee rows**).
  2. Challan ↔ deductee reconciliation with differences highlighted.
  3. Generate FVU / file via provider.
  4. Store token and acknowledgement; correction returns.

  Deductor details come from the Statutory set-up (§1.1), never retyped.

### 1.7 Form 16 — [16](../ui-screens/04-india-statutory/16-form-16.png)
- **Layout:** employee, PAN | company, TAN, FY, **"TDS Return (Q4)"** link; salary summary (gross, taxable, tax deducted); Part A (TRACES) status; Part B status. Header buttons "Generate Part B" and "Request Part A (TRACES)".
- **Observed:**
  - The field is labelled **Q4 return**, but it **accepted our Q2 return** without complaint.
  - "Generate Part B" left every amount at **₹0.00** mid-year, with no message explaining why (the year is not over).
- **YukthiX:** Form 16 is a year-end bulk action. It can be generated only after the Q4 return is filed. Show a per-employee status (Part A downloaded, Part B generated, digitally signed, published to the employee's app), plus a clear "available after 31 May" state during the year.

### 1.8 Regime selector — [03-payroll/24](../ui-screens/03-payroll/24-tax-regime-selector.png)
Covered in [module 03 §1.9](03-payroll-engine.ui-reference.md): the employee tax centre.

---

## 2. YukthiX Statutory screen inventory

| # | YukthiX screen | Based on Frappe | Notes / additions |
|---|---|---|---|
| 1 | Statutory set-up per legal entity (registrations + coverage rules) | 1.1 | Completeness per card; state-wise PT/LWF |
| 2 | Employee Statutory tab + company completeness | 1.1 | PAN/UAN/IFSC validation, missing-ID dashboard |
| 3 | **Monthly statutory checklist** (PF, ESI, PT, LWF, TDS) | 1.3, 1.5 | Due dates, generate file, mark paid, receipt upload, history |
| 4 | Registers (EPF, ESIC, PT, LWF) with portal exports | 1.3, 1.4 | Covered/not-covered labels, pinned columns |
| 5 | Quarterly TDS return wizard (24Q) | 1.6 | Opening-balance rows, challan reconciliation, FVU / e-file, corrections |
| 6 | Year-end: Form 16 bulk + publish to employees | 1.7 | Part A/B status, digital signature |
| 7 | Payslip statutory lines + employer contribution box | 1.2 | Rule tooltips |

Gap analysis items from the functional spec, such as gratuity provisioning, bonus act, the new wage-code 50 % rule and state-specific PT slabs, attach to screens 1, 3 and 4.

---

## 3. UI issues seen on the instance (do not copy)

U1–U38 are in modules [01](01-leave-management.ui-reference.md), [02](02-attendance-and-shifts.ui-reference.md) and [03](03-payroll-engine.ui-reference.md).

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U39 | Set-up | Statutory data spread over settings, company, employee and assignment; deductor PAN is a generic "Tax ID". | One statutory area per legal entity. |
| U40 | TDS return | 12+ missing deductor fields found only at return validation. | Completeness check when the statute is switched on. |
| U41 | Employee | Statutory IDs in a collapsed section; bank shows IBAN but not IFSC. | India-first bank and ID fields, visible and validated. |
| U42 | Everywhere | Missing PAN never warned about. | Missing-ID dashboard + warning on the run pre-flight. |
| U43 | Reports | Core PF and PT deduction reports empty while slips have PF/PT; duplicate report families. | One report per purpose, same numbers as the registers. |
| U44 | ESIC / LWF registers | Non-covered rows at ₹0 with no label; status pills truncated. | Explicit "not covered / not due" states. |
| U45 | TDS challan | Amount typed by hand; no late-interest calculation. | Pre-fill from the run; compute interest/fee. |
| U46 | TDS return | Opening balances (Jul–Aug) missing from the Q2 return. | Import prior-month deductee rows for mid-year starts. |
| U47 | TDS return | Deductor/responsible-person address retyped per return; ₹0.29 deposit/deduction difference not flagged. | Pull from set-up; show reconciliation. |
| U48 | Form 16 | "Q4 return" field accepted a Q2 return; Part B generated all zeros silently. | Enforce the Q4 link; explain the "available after year end" state. |

---

## 4. Capture notes

- **Demo data:** `yx_demo04.py` in the session scratchpad:
  - Fiscal year 2026-2027 (it already existed).
  - Company TAN and deductor details; dummy employee IDs and bank details.
  - LWF on; September TDS challan (submitted).
  - 24Q Q2 via *Fetch from Payroll* (draft; validation run); Form 16 draft for Ananya.
- **Temporary changes, all reverted 24 Sep 2026:**
  - API key used for two capture batches, revoked after each.
  - Administrator's default company switched to *workfox* for capture, then restored.
- A brief network drop failed three captures. Two were retaken; the regime selector is reused from module 03.
- The statutory demo data remains on the instance.
