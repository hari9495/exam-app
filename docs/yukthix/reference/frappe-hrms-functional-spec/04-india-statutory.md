# 04 · India Statutory — Functional Reference

**Source studied:** Frappe "India Payroll" app, `develop` branch (downloaded Sep 2026), folder `india-payroll-develop` (GPL-3)
**Maps to YukthiX:** §1.3.5 statutory packs (PF, ESI, PT, LWF, TDS, returns and challans, Form 16), §2.1.6 per-country statutory packs
**Clean-room status:** written in our own words; no code, identifiers or UI text copied.
**Data dictionary:** every object and field → [04-india-statutory.data-dictionary.md](04-india-statutory.data-dictionary.md)
**⚖️ Law checks:** notes marked **Law check** come from Indian law, not from the code. **Statutory rules in YukthiX must be built from the law and current government notifications**, never from this code. Items marked *(verify)* change often — confirm against the latest state/central notification before building.

---

## 0. How it works — the big picture

A companion app that plugs into Frappe HRMS; it doesn't work alone.

```
Payroll Settings ── India tab: PT / ESI / LWF / EPF on-off switches, multi-company table (ESIC code, EPF est. code, PT reg, LWF reg), TDS filing API keys
Company ─────────── TAN, deductor type, responsible person (name, PAN, designation)
Employee ────────── UAN, name as per EPFO, ESIC IP number, IFSC, MICR, payment mode, account type
Structure Assignment ── employment STATE, PwD flag, LWF exempt + reason, EPF applies, PF on actual wage, VPF (amount or %)
        │
        ▼
Salary slip (India hook, runs in this order):  PT → ESI → LWF → EPF → employer contributions (ESI only)
        │
        ▼
Registers & files:  PF register + ECR file · ESIC register CSV · LWF register CSV · Bank mandate
TDS (Part B):       Challans → quarterly return 24Q (via external filing API) → Form 16 · Tax-regime selector
```

**Installed defaults:** components Professional Tax, Employee ESI (0.75 %), Employer ESI (3.25 %), Labour Welfare Fund, Provident Fund (12 %), Voluntary PF, plus employer EPF (A/c 1), EPS (A/c 10), EDLI (A/c 21), EPF admin (A/c 2) — **the last four are created but never calculated**. Three tax slabs (old regime, new regime 2024-25, new regime 2025-26), ~18 exemption categories (80C, 80D, 24, 80CCD(1B), 80E, 80TTA/TTB, 80G, 80GG, 80U …) and a "Payroll Manager" role.

---

## 1. Company scope & registrations

| ID | Rule |
|---|---|
| IN-CS-01 | Each statute (PT, ESI, LWF, EPF) has a global master switch. Off → no company gets it. |
| IN-CS-02 | Multi-company off → every company gets every enabled statute; one global ESIC code and EPF establishment code. |
| IN-CS-03 | Multi-company on → a statute applies only to companies listed in the table; a listed company gets **all** enabled statutes (not per statute). At least one row; no duplicate company; numbers trimmed. |
| IN-CS-04 | Registers still show slips that actually carry a deduction, even if the company was later removed. |
| IN-CS-05 | Registration numbers are stored but **not used** in any report or file. |

**Law check:** PT and LWF registrations are held **per state**, not per company — a multi-state employer holds several. One field per company can't represent that.

**Source:** `india_payroll/india_payroll/company_settings.py`, `doctype/india_payroll_company_setting/`

---

## 2. EPF (Provident Fund)

**Data.** Per assignment: EPF applies (the only eligibility gate), PF on actual wage, VPF mode (amount / %) and value. Per employee: UAN, name as per EPFO.

| ID | Rule |
|---|---|
| IN-PF-01 | EPF off for the company, or "EPF applies" unticked → PF and VPF rows removed. |
| IN-PF-02 | Settings read from the latest submitted assignment on/before the slip **end** date. |
| IN-PF-03 | **PF wage** = paid (LOP-reduced) amounts of earnings whose **name** reads as Basic or Dearness Allowance / DA. Additional-salary items (arrears, bonus) never count. No Basic/DA found → alert, PF skipped. |
| IN-PF-04 | EPF base = actual PF wage if "on actual" ticked, else min(PF wage, ₹15,000). |
| IN-PF-05 | Employee PF = 12 % of base, rounded half-up to the rupee. |
| IN-PF-06 | VPF amount = elected amount × paid days ÷ working days; VPF % = % × EPF base (so capped at ₹15,000 unless "on actual"). |
| IN-PF-07 | Employer EPF / EPS / EDLI / admin are **not** put on the slip or in CTC — only rebuilt in the PF register. |

> **Examples.** Basic ₹15,000 → PF **₹1,800**. Basic ₹25,000 capped → ₹1,800; on actual → **₹3,000**. VPF 5 % on ₹15,000 → ₹750. VPF ₹3,000 with 5 LOP days of 30 → ₹2,500. Basic ₹20,000 with half month paid → PF wage ₹10,000 → PF ₹1,200.

**Law check.**
- Membership is compulsory up to ₹15,000 wage in covered establishments (20+ employees); above that optional ("excluded employee") unless already a member. Code relies only on the checkbox.
- PF wage should include allowances paid **universally and uniformly** (Supreme Court, *Vivekananda Vidyamandir*, 2019) — not just components *named* Basic/DA; retaining allowance also counts.
- **EPS** 8.33 % of min(wage, ₹15,000) = max **₹1,250** continues for members who joined before 1 Sep 2014 or joined at ≤ ₹15,000, even when wage later exceeds ₹15,000. EPS stops at **age 58** (full 12 % to EPF).
- Employer contribution above the ceiling needs the joint option (para 26(6)); employee-only higher contribution must be possible.
- **EDLI** 0.5 % of wage capped at ₹15,000 (max ₹75); **admin** 0.5 % of EPF wages, minimum ₹500/month per establishment; EDLI admin 0 % since 2017.
- International workers: no ceiling, separate rules.

**Source:** `india_payroll/india_payroll/epf.py`

---

## 3. ESI (Employees' State Insurance)

| ID | Rule |
|---|---|
| IN-ESI-01 | ESI off for the company → row removed; employer amount 0. |
| IN-ESI-02 | Ceiling ₹21,000 (₹25,000 for persons with disability, flag on assignment), inclusive. |
| IN-ESI-03 | **Coverage** is judged on the **full-month gross** (unreduced; excludes statistical and "not in total"). LOP can't pull a high earner into ESI. |
| IN-ESI-04 | Employee share = 0.75 % of **paid** gross; employer share = 3.25 % of paid gross; rounded to paise. |
| IN-ESI-05 | Employer ESI is written to the slip's employer-contribution table and **added to CTC** (the only automatic employer contribution). |

> **Examples.** Gross ₹20,000 → ₹150 + ₹650. Gross ₹15,000 → ₹112.50 + ₹487.50; CTC = 1,80,000 + 12 × 487.50 = **₹1,85,850**. Gross ₹21,000 covered; ₹21,001 not. ₹22,000 earner with half month LOP → still not covered.

**Law check.**
- Rates 0.75 % / 3.25 % (since 1 Jul 2019) and ceilings ✔.
- **Contribution-period continuation**: periods Apr–Sep and Oct–Mar; once covered at the start of a period, the employee stays covered (on actual wages) until the period ends even if wage exceeds the ceiling. **Not implemented** — code re-tests monthly.
- Contributions are rounded **up to the next rupee** (code rounds to paise: ₹112.875 → ₹112.88; law ₹113).
- Average daily wage ≤ ₹176 → no employee share, employer still pays.
- Overtime counts in contribution but not in coverage test.

**Source:** `india_payroll/india_payroll/esi.py`, `employer_contributions.py`

---

## 4. Professional Tax (PT)

**Data.** Employment **state** on the assignment (defaulted from the company's address; saving an assignment without a state is blocked when PT is on); gender on employee.

| ID | Rule |
|---|---|
| IN-PT-01 | PT off → row removed. State empty or not a PT state → slip left untouched (a stale PT row is **not** removed). |
| IN-PT-02 | Slabs are hard-coded; first slab whose upper limit ≥ salary applies (limits inclusive). |
| IN-PT-03 | Monthly states: tested on the slip's **paid gross**. |
| IN-PT-04 | Maharashtra: women with gross ≤ ₹25,000 pay 0; men in the top slab pay ₹300 in **February**. |
| IN-PT-05 | Half-yearly states (Tamil Nadu, Kerala): half-years Apr–Sep / Oct–Mar; cumulative paid gross of **submitted** slips in the half-year + this slip → slab amount − PT already deducted (never negative). |

**State slabs as configured in the code** (₹/month; TN & KL ₹/half-year on half-year gross):

| State | Slabs |
|---|---|
| Andhra Pradesh / Telangana | ≤15,000: 0 · ≤20,000: 150 · above: 200 |
| Assam | ≤10,000: 0 · ≤15,000: 150 · ≤25,000: 180 · above: 208 |
| Bihar | ≤25,000: 0 · above: 200 |
| Gujarat | ≤5,999: 0 · ≤8,999: 80 · ≤11,999: 150 · above: 200 |
| Jharkhand | ≤25,000: 0 · above: 100 |
| Karnataka | ≤25,000: 0 · ≤41,666: 150 · above: 200 |
| Madhya Pradesh | ≤18,750: 0 · ≤25,000: 125 · ≤33,333: 167 · above: 208 |
| Maharashtra | ≤7,500: 0 · ≤10,000: 175 · above: 200 (Feb 300); women ≤25,000 exempt |
| Meghalaya | 11 slabs from 0 to 208 |
| Odisha | ≤13,304: 0 · ≤25,000: 125 · ≤41,666: 167 · above: 208 |
| Sikkim | ≤20,000: 0 · ≤30,000: 125 · ≤40,000: 150 · above: 200 |
| Tripura | ≤7,500: 0 · ≤15,000: 150 · above: 208 |
| West Bengal | ≤8,500: 0 · ≤10,000: 90 · ≤15,000: 110 · ≤25,000: 130 · ≤40,000: 150 · above: 200 |
| Tamil Nadu (half-yearly) | ≤21,000: 0 · ≤30,000: 135 · ≤45,000: 315 · ≤60,000: 690 · ≤75,000: 1,025 · above: 1,250 |
| Kerala (half-yearly) | ≤11,999: 0 · … · ≤99,999: 1,440 · above: 1,560 |

> **Examples.** Maharashtra man ₹30,000 → 11 × 200 + 300 = **₹2,500/year**. Tamil Nadu ₹12,000/month → Apr 0, May 135, Jun 180, Jul 375, Aug 0, Sep 335 = **₹1,025** for the half-year.

**Law check** *(slabs change often — verify all)*:
- Constitutional cap **₹2,500/year** (Art. 276). Kerala as configured reaches ₹3,120/year — breaks the cap.
- Likely outdated in code: Gujarat (exemption raised to ~₹12,000), Karnataka (₹200 from ₹25,000 with ₹300 in February after 2025 amendment), West Bengal (≤₹10,000 nil), Assam, Tamil Nadu (revised 2024), Odisha, Bihar and Jharkhand (annual slabs in law).
- ₹208/month states total ₹2,496; law adjusts the last month to reach ₹2,500.
- Missing PT states: Manipur, Mizoram, Nagaland, Puducherry, Punjab, Chhattisgarh *(verify)*.
- **YukthiX:** PT slabs must be **data (versioned by effective date)**, not code, so a rate change is a data update.

**Source:** `india_payroll/india_payroll/professional_tax.py`

---

## 5. Labour Welfare Fund (LWF)

| ID | Rule |
|---|---|
| IN-LWF-01 | LWF off, state not an LWF state, or employee marked exempt → row removed. |
| IN-LWF-02 | Monthly states deduct every month; half-yearly in **June and December**; annual in **December** (by slip start month). |
| IN-LWF-03 | Flat employee amount — independent of wage or days. Employer amount used only in the register (not slip, not CTC). |

| State | Frequency | Employee ₹ | Employer ₹ |
|---|---|---|---|
| Haryana | Monthly | 34 | 68 |
| Kerala | Monthly | 50 | 50 |
| Punjab / Chandigarh | Monthly | 5 | 20 |
| Chhattisgarh | Half-yearly | 15 | 45 |
| Delhi | Half-yearly | 0.75 | 2.25 |
| Goa | Half-yearly | 60 | 180 |
| Gujarat | Half-yearly | 6 | 12 |
| Madhya Pradesh | Half-yearly | 10 | 30 |
| Maharashtra | Half-yearly | 25 | 75 |
| Odisha | Half-yearly | 20 | 40 |
| West Bengal | Half-yearly | 3 | 30 |
| Andhra Pradesh | Annual | 30 | 70 |
| Karnataka | Annual | 50 | 100 |
| Tamil Nadu | Annual | 20 | 40 |
| Telangana | Annual | 2 | 5 |

**Law check** *(verify)*: Haryana employee share is **0.2 % of salary capped at ₹34** (employer 2×) — flat ₹34 over-deducts below ₹17,000. West Bengal employer likely ₹15. Most LWF Acts exclude employees above a wage/designation threshold. Each state board has its own challan/return form.

**Source:** `india_payroll/india_payroll/lwf.py`

---

## 6. Employer contributions & CTC

Only **employer ESI** is automatic (in CTC and on the slip). Employer EPF, EPS, EDLI, admin and LWF employer share reach CTC only if HR adds them to the structure manually.
> ₹15,000 Basic with PF set up manually: EPF ₹550 + EPS ₹1,250 + EDLI ₹75 + admin ₹75 = **₹1,950/month** on top of ESI.

**Law check:** employer statutory cost = 12 % PF (EPF + EPS) + EDLI 0.5 % + admin 0.5 % (min ₹500) + ESI 3.25 % + LWF employer share.

---

## 7. Statutory settings on the Structure Assignment

Employment state · PwD (ESI ceiling ₹25,000) · LWF exempt + reason · EPF applies · PF on actual wage · VPF mode / % / amount. **All editable after submit**; slips read the assignment in force on the slip **end** date, registers on the slip **start** date — using **current** values. Also: button / bulk action to e-mail employees asking them to choose a tax regime.

---

## 8. Registers & files

| Report | Output | Key rules |
|---|---|---|
| **PF register + ECR file** | Per slip: UAN, name, gross, EPF / EPS / EDLI wages, employee PF, VPF, EPS, employer PF, NCP days, refund. **ECR 2.0 text file**: no header, one line per member, 11 fields separated by `#~#` (UAN · NAME IN CAPS · gross · EPF wages · EPS wages · EDLI wages · employee PF+VPF · EPS · employer EPF diff · NCP days · refund). Missing UAN → export fails listing employees. | EPS = 8.33 % if PF wage ≤ ₹15,000 else **0**; employer PF = 12 % − EPS; NCP = LOP + absent days. Filter by month or contribution period. |
| **ESIC register** | Per slip: IP no., gross, 0.75 %, 3.25 %, total, status (Covered / PwD / Exempt); CSV export | Recomputed from paid gross, not read from slip. |
| **LWF register** | Per slip: state, frequency, employee, employer, status (Deducted / Non-deduction month / Exempted / No LWF state); CSV | Uses **current** configured amounts. |
| **Bank mandate** | Net pay with bank name, account, IFSC, MICR, account type, NEFT/RTGS | Current employee bank details; sorted by department. |

> **ECR example.** Basic ₹12,000 + DA ₹3,000 + HRA ₹6,000, 2 LOP days, UAN 100123456789 →
> `100123456789#~#RAVI KUMAR#~#21000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#2#~#0`

**Law check:** EPFO expects **one ECR per wage month** (half-year option produces invalid files). ESIC monthly upload has its own Excel template (IP no., name, days worked, wages, reason code, last working day) — this CSV isn't it. Bank bulk-payment formats are bank-specific. README mentions a PT register that **doesn't exist**.

**Source:** `india_payroll/india_payroll/report/`

---

## 9. Suspected defects — statutory

| # | Suspicion | How to test |
|---|---|---|
| IN-D1 | EPS = 0 for anyone with PF wage > ₹15,000 (should be ₹1,250 for pre-2014 / joined-at-≤₹15k members); no age-58 cut-off. | Basic ₹20,000 → register EPS 0. |
| IN-D2 | Employer EPF/EPS/EDLI/admin never computed; CTC understated. | CTC − gross = ESI only. |
| IN-D3 | Slip uses assignment at slip **end**, registers at slip **start**; statutory fields editable after submit and registers read **current** values → history rewritten. | Untick EPF after March payroll; March register rows vanish. |
| IN-D4 | ESIC register tests coverage on paid gross, slip on full gross → mismatch. Registers show liabilities even when statute is off. | ₹22,000 with half-month LOP. |
| IN-D5 | ESI rounded to paise, no contribution-period continuation, no ₹176/day exemption. | ₹15,050 → ₹112.88. |
| IN-D6 | Kerala PT breaks ₹2,500 cap; several states' slabs outdated; half-yearly PT counts only **submitted** slips and sums across **all companies**; stale PT row not removed on state change. | Kerala ₹1,00,000/month → ₹3,120/year. |
| IN-D7 | PF wage by component **name** — misses "Fixed Pay", catches "Basic Arrear" in structure; VPF % capped at ₹15,000. | Structure with "Fixed Pay". |
| IN-D8 | **ECR download has no permission check** — any logged-in user can fetch UANs, names, wages for any company. | Call as Employee-only user. |
| IN-D9 | ECR allows multi-month file with duplicate UANs; clearing Month makes registers include every slip ever. | Choose Apr–Sep. |
| IN-D10 | LWF flat in Haryana, no wage thresholds, deducted twice with two slips in a deduction month; employer LWF missing from CTC. | Haryana ₹10,000 → ₹34 (law ₹20). |
| IN-D11 | All slabs and rates hard-coded → rate change needs a software release. | Code review. |

---

## 10. TDS filing — settings & external provider

**Purpose.** File salary TDS returns through a third-party compliance API (Sandbox — sandbox.co.in) instead of the government utilities directly.
**Data.** Payroll Settings: enable switch, test-environment switch, API key and secret (encrypted), API version; cached token. Company: **TAN**, deductor type (Company, Branch, Central/State Govt, …), responsible person name, **PAN**, designation. Site operators can provide keys, override endpoints, or run an offline **mock mode**.

| ID | Rule |
|---|---|
| IN-TDS-01 | Filing can be enabled only when a full key + secret pair exists (settings or site config; never mixed). |
| IN-TDS-02 | TAN format: 4 letters + 5 digits + 1 letter; PAN format: 5 letters + 4 digits + 1 letter (both uppercased). |
| IN-TDS-03 | Login gives a token cached for 23 h (provider validity 24 h); a 401 triggers one re-login and retry. |
| IN-TDS-04 | Every call/upload/download is logged with secrets masked. |

**Generic job flow:** create job (TAN, quarter, form, year) → provider returns job ID + pre-signed upload URL(s) → upload payload (starts processing) → a **poller every 5 minutes** checks status → download result files and attach them (provider keeps them only 30 days).

**Law check:** the filed statement must be verified by the responsible person (DSC / EVC) — how this happens via the provider is unclear.

---

## 11. TDS Challan

**Purpose.** Record each deposit of salary TDS (ITNS 281) so deductee rows can be linked to it.
**Data.** Company, TAN, financial year, quarter (Q1–Q4), section (default 192), deposit date, **BSR code**, **challan serial no.**, payment mode, bank, total deposited, minor head (200 / 400), breakup (TDS, surcharge, cess, interest, fee 234E, others), **deduction month** (salary month it pays for).

| ID | Rule |
|---|---|
| IN-CH-01 | TAN required (from company). BSR code exactly 7 digits. |
| IN-CH-02 | Breakup must equal total within ₹1 (when breakup entered). |
| IN-CH-03 | Deduction month defaults to the month before the deposit date. |
| IN-CH-04 | Only TDS + surcharge + cess count as tax available to deductee rows (interest, fee excluded). |

**Law check:** deposit by the **7th of next month**; March TDS by **30 April**. CIN = BSR + date + 5-digit serial. Interest 201(1A): 1 %/month late deduction, 1.5 %/month late deposit; fee 234E ₹200/day capped at TDS — the app records but doesn't compute these. Under the Income-tax Act 2025 (from 1 Apr 2026) the section number changes *(verify)*.

---

## 12. TDS Return (Form 24Q; Form 138 from tax year 2026-27)

**Purpose.** Quarterly salary TDS statement per TAN, built from submitted slips and challans, then validated, converted to TXT → FVU, and e-filed via the provider.
**Data.** Company, TAN, PAN, financial year, quarter, return type (Original / Revised + previous receipt no.), filing status; deductor & responsible-person contact and structured address, government-deductor block (AIN etc.), TRACES-registered mobile (for CSI OTP); **deductee rows**; totals (paid, deducted, deposited); validation issues; files (TXT, CSI, FVU zip, Form 27A PDF); acknowledgement (token no., provisional receipt no., filed at); filing log.

**Quarters.** Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. A slip belongs to a quarter only if it starts **and** ends inside it. **Annexure II** (annual salary details) only in Q4. From tax year 2026-27: form code 24Q → **138**, label "TY" instead of "FY".

**Filing status flow**
```
Draft ─Validate─► Validating ─► Validated ─┐       (or Skip Validation with a reason ─► Validation Skipped)
                                           ▼
 Generate TXT ─► TXT Generated ─ fetch CSI (OTP) ─ Generate FVU ─► FVU Generated (+ Form 27A) ─ E-File ─► Filed
 any step: fail / timeout ─► Failed.   Document can be submitted only when Filed.
```

**Deductee rows (Fetch from Payroll).** One row per submitted slip in the quarter with TDS > 0: employee, PAN, month, payment date = deduction date = slip posting date, **amount paid = gross pay**, tax deducted = TDS components, challan (the challan whose deduction month = row month; else the only challan in the quarter; else blank), regime flag (default **new**), category (general), PAN-operative flag. Re-fetch wipes manual edits.

| ID | Rule |
|---|---|
| IN-24Q-01 | One non-cancelled return per TAN + year + quarter + form + return type. Revised needs previous receipt no. |
| IN-24Q-02 | Deductee PAN valid, or placeholder "PAN not available / applied / invalid". |
| IN-24Q-03 | **Per-challan reconciliation:** tax used by earlier submitted returns + this return ≤ challan tax (+ ₹1). Rows without challan or with a foreign challan are reported. |
| IN-24Q-04 | **Overall:** total deducted − total deposited ≤ ₹10, else blocked. |
| IN-24Q-05 | Deductor profile must have every field the provider's schema marks mandatory. |
| IN-24Q-06 | One step at a time; steps run in background (15-min timeout); job stuck "created" > 20 min or any job > 180 min → Failed. |
| IN-24Q-07 | New TXT invalidates FVU and 27A. Revised return → "correction" filing. |
| IN-24Q-08 | CSI (challan status file) fetched via OTP to the TRACES mobile, for the quarter's date range. |

> **Reconciliation example.** Challan tax ₹50,000; earlier returns used ₹30,000; this return links ₹25,000 → over-draw **₹5,000** → blocked. Rows ₹72,015 vs challans ₹72,000 → short ₹15 > ₹10 → blocked.

**Law check.**
- Due dates: **Q1 31 Jul, Q2 31 Oct, Q3 31 Jan, Q4 31 May**; late fee 234E, penalty 271H — not tracked.
- Annexure II must carry each employee's **full-year computation** (exemptions, Chapter VI-A, 87A, regime, landlord PAN if rent > ₹1 L, lender details) for **everyone paid in the year**, including leavers — the app fills 5 of 100 columns and only Q4 deductees.
- CSI must cover challans deposited **after** quarter end (7th / 30 April) — a salary-quarter window misses them.
- Corrections are normally prepared from the TRACES consolidated file.
- No PAN → higher rate under 206AA — not handled.

---

## 13. Form 16

**Purpose.** Annual TDS certificate per employee: **Part A** (from TRACES) and **Part B** (salary & tax computation), requested from the provider and attached as PDFs.
**Data.** Employee, PAN, company, TAN, financial year, linked Q4 return, gross salary, taxable income, tax deducted; Part A / Part B status (Pending → Requested → Available / Failed) and PDFs.

| ID | Rule |
|---|---|
| IN-F16-01 | Bulk-created from a **Q4** return: one per Q4 deductee with slips in the year; figures from the employee's **latest** slip (gross YTD, annual taxable, total tax). Existing Form 16 for the employee + year → skipped. |
| IN-F16-02 | Part A requested only after the return is Filed. |

**Law check:** issue by **15 June**; Part A only after TRACES processes Q4 (days after filing), needs TRACES login + KYC; Part B must contain the full computation; required for **every** employee with TDS, including leavers.

---

## 14. Tax Regime Selector (employee self-service)

**Purpose.** Employee (or HR) compares tax under old vs new regime, enters declarations, and saves the chosen regime (tax slab) on the **draft** structure assignment; then opens a pre-filled exemption declaration. HR can e-mail employees (single or bulk) asking them to choose.

**Comparison logic**
- Gross = assignment's annual gross (or last slip × periods); can be overridden on screen.
- **Old regime taxable** = gross − ₹50,000 standard deduction − HRA exemption − LTA − employer NPS (≤ 10 % of basic) − Chapter VI-A.
  - HRA exemption = min(annual HRA, 50 % / 40 % of basic, rent − 10 % of basic).
  - Chapter VI-A caps: 80C + 80CCC + 80CCD(1) ≤ ₹1,50,000; 80CCD(1B) ₹50,000; 80D ₹75,000; 80DD ₹1,25,000; 80DDB ₹1,00,000; 24(b) ₹2,00,000; 80EEA ₹1,50,000; 80EE ₹50,000; 80GG ₹60,000 (hidden if HRA); 80TTA ₹10,000 / 80TTB ₹50,000 (seniors); 80U ₹1,25,000; 80E, 80G, 80GGC uncapped.
  - Declarations are pre-filled from payroll deductions (e.g. EPF ₹1,800/month → ₹21,600 in 80C).
- **New regime taxable** = gross − ₹75,000 − employer NPS (≤ 10 % of basic).
- Always compares "Old Tax Regime: 2019" vs "New Tax Regime: 2025-2026"; recommends Old only if strictly cheaper (tie → New).
- Senior citizen = 60+ on 1 April of the current FY.

> **Example.** Basic ₹1,00,000/month, HRA ₹50,000/month (gross ₹18 L); rent ₹40,000/month in a metro; 80C ₹21,600.
> HRA exemption = min(6,00,000; 6,00,000; 4,80,000 − 1,20,000) = **₹3,60,000**.
> Old taxable ₹13,68,400 → tax ₹2,23,020 + cess = **₹2,31,940.80**. New taxable ₹17,25,000 → ₹1,45,000 + cess = **₹1,50,800**.
> → **New regime saves ~₹81,141.**

| ID | Rule |
|---|---|
| IN-REG-01 | Saving needs the assignment to be a draft; slab must be submitted, enabled, same company and currency. |
| IN-REG-02 | Employees can only see / change their own; others need Employee read + assignment read/write. |

**Law check.** New regime is the **default** (115BAC(1A)) unless the employee opts out — page leaves drafts without a default. Employer NPS 80CCD(2) in new regime: **14 %** of basic + DA (from FY 2024-25). HRA metro 50 % applies to Delhi, Mumbai, Kolkata, Chennai (page lists 8 cities). HRA and NPS should use basic **+ DA**. LTA exempt only for actual travel (2 journeys / 4 years). 80D ₹25,000 / ₹50,000 per self and parents; 80DD / 80U fixed amounts; old-regime PT deduction 16(iii) missing. Senior = turns 60 **during** the FY. Proofs via **Form 12BB** not captured.

---

## 15. Suspected defects — TDS, Form 16, regime

| # | Suspicion | How to test |
|---|---|---|
| T-D1 | CSI window = salary quarter → misses challans deposited after quarter end → FVU likely fails. | Q1 with challan dated 7 Jul. |
| T-D2 | Revised return collides with the Original's name; Original's usage makes Revised look over-drawn. | Create Revised for a submitted Original. |
| T-D3 | A Filed return can be e-filed again (no status guard); "Accepted" status never set. | E-File on a Filed draft. |
| T-D4 | Regime flag / category / PAN-operative never derived from slab, DOB, gender. | Old-regime employee → row says new. |
| T-D5 | PAN placeholders pass locally but fail the provider schema. | Validate with "PAN applied". |
| T-D6 | Challan minor head ignored; total-only challan (no breakup) makes every row look over-drawn; year/quarter not checked against deposit date. | Challan with total only. |
| T-D7 | **Annexure II / Form 16 use projected annual tax from the last slip**, not tax actually deducted; leavers omitted. | Employee left in November. |
| T-D8 | Form 16 Part B sends no computation; Part A no TRACES credentials; failures store no reason. | Request both live. |
| T-D9 | Slips crossing a quarter boundary silently excluded. | Slip 16 Jun–15 Jul. |
| T-D10 | New-Act deposit date = deduction date (should be challan date); deductor type code not copied from company → new-Act returns blocked until typed. | FY 2026-27 TXT. |
| T-D11 | Validate reports "Validated" even when the provider lists potential notices. | Report with notices. |
| T-D12 | Regime page: fixed slab names regardless of year, 10 % NPS in new regime, basic without DA, no PT in old regime, senior test on 1 April. | DOB 15 Oct 1966 in FY 2026-27. |

---

---

## 16. Permissions summary

| Object | Who |
|---|---|
| PF / ESIC / LWF / Bank mandate reports | HR Manager, HR User (queries ignore record-level permissions) |
| **ECR download** | **Any logged-in user — no permission check (IN-D8)** |
| Statutory fields on assignment | Anyone who can edit the assignment — **editable after submit** |
| TDS Challan, TDS Return, Form 16 | System Manager, Payroll Manager (role created by the app) |
| Tax Regime Selector | Employee (own only), HR User, HR Manager, System Manager |

---

## 17. Gap analysis vs YukthiX spec §1.3.5 statutory packs

| Capability | Frappe India Payroll | YukthiX | Note |
|---|---|---|---|
| EPF employee + VPF | ✅ (name-based PF wage) | ✅ | Build PF wage from a **component flag**, plus universal-allowance rule. |
| Employer EPF / EPS / EDLI / admin computed | ❌ (register only) | ✅ | Must compute, show in CTC and slip; pre-2014 EPS, age 58, international workers. |
| ECR file | ✅ ECR 2.0 | ✅ | One file per wage month; include arrears ECR. |
| ESI with contribution-period continuation, rupee round-up, ₹176/day rule | ⚠️ partial | ✅ | Implement per law. |
| ESIC portal upload format | ❌ | ✅ | Use ESIC Excel template. |
| PT all states, slabs as **dated data** | ⚠️ 16 states, hard-coded, several outdated | ✅ | Versioned rate tables; ₹2,500 cap check; PT returns/challans per state. |
| LWF all states incl. % based (Haryana), thresholds | ⚠️ flat amounts | ✅ | Versioned data; state forms. |
| Registrations per **state** | ❌ per company | ✅ | Legal entity → state registrations (PT, LWF, S&E). |
| TDS challan register | ✅ | ✅ | Add interest/late-fee calculation, due-date alerts. |
| 24Q / 138 quarterly return | ✅ via provider | ✅ | Full Annexure II, correct CSI window, due-date tracking, corrections from TRACES. |
| Form 16 Part A/B | ⚠️ skeleton | ✅ | Full Part B computation; bulk TRACES Part A; digital signing; e-mail to employees. |
| Tax regime selection | ✅ self-service | ⚠️ | Default new regime; year-correct slabs; 12BB proofs. |
| Form 12BB, landlord PAN, lender details | ❌ | ⚠️ §1.3.5 proofs | Add to declarations/proofs. |
| Statutory bonus, gratuity provisioning, minimum wages | ❌ | ❌ | India pack. |
| Compliance calendar (due dates, reminders) | ❌ | ❌ | 💡 High value for SMBs. |
| Rates / slabs updatable without release | ❌ hard-coded | — | 💡 YukthiX: statutory rules as dated data, maintained centrally for all tenants. |

---

## 18. YukthiX design questions (for the later design phase)

1. Which states must PT and LWF cover at launch (the states of our first customers, or all)?
2. Who maintains statutory rate tables — our central compliance team pushing updates to all tenants?
3. TDS filing: build our own TXT/FVU pipeline (using the government's free utilities), or use a provider API like Sandbox / ClearTax?
4. Form 16: generate Part B ourselves and digitally sign; Part A via TRACES bulk download?
5. Should we file PF (ECR upload) and ESI returns directly via their portals/APIs, or produce files for HR to upload?
6. Compliance calendar with reminders and penalty estimates — launch or later?

---

## 19. Source pointers (for verification only)

| Area | Path in `india-payroll-develop/india_payroll` |
|---|---|
| Install, hooks, patches | `hooks.py`, `install.py`, `patches/` |
| Company scope | `india_payroll/company_settings.py`, `doctype/india_payroll_company_setting/` |
| EPF, ESI, PT, LWF, employer contributions | `india_payroll/epf.py`, `esi.py`, `professional_tax.py`, `lwf.py`, `employer_contributions.py` |
| Tax slabs, exemptions, surcharge | `install.py`, `india_payroll/tax_exemption_setup.py`, `income_tax_utils.py` |
| Registers | `india_payroll/report/` |
| TDS pipeline | `india_payroll/tds/` |
| Challan, return, Form 16 | `india_payroll/doctype/tds_challan/`, `tds_return*/`, `form_16/` |
| Regime selector | `india_payroll/page/tax_regime_selector/`, `public/js/tax_regime_selector/` |
