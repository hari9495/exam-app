# Compare: payroll (Zoho Payroll, Keka, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `zoho-payroll-pages.md` (Zoho Payroll India trial, seen 17 Nov 2026), the main source;
- `keka-pages.md` and `keka-map.md` (My Finances: payslips, salary, tax declaration);
- YukthiX code on `test/yukthix-main`: `apps/api/src/payroll`, `apps/api/src/statutory` (rule packs), the settings
  registry, `packages/yx-ui/src/screens/pay`, the `/yx/payroll` and `/yx/me` routes, `pay-design-map.md` (PAY and CMP
  screens).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.

Notes:
- Zoho's pay run could not be opened (it is locked until the organisation PAN is entered), so the run rows (section C)
  compare against Zoho's settings, components and reports, not its run screens.
- Keka was seen from an employee's side only. Rows that `compare-expenses-pay.md` already covers point to its id
  (for example "expenses-pay B3") and are not counted again.
- Every YukthiX India rule file still says "verify" (a CA has to confirm it). That is not a gap against Zoho, but it
  must be cleared before a real company goes live.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take Z:** build it the way Zoho Payroll does.
- **Mix:** combine.
- **Skip:** not worth it.

Picks put statutory correctness first, then auditability, then ease. Every pick is built in our own design, kit first;
no Zoho wording or branding.

## A. Set-up

| # | Feature | Zoho Payroll | Keka | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Set-up checklist | Before the first run the dashboard is an 8-step list with "n/8 Completed" and "Mark as Completed" | — | Has: PAY-16 set-up wizard (registrations with a completeness check, pay groups, opening balances, go-live); PAY-01 first-use state links to it; no progress count | **Mix:** keep our wizard; add a "n of 6 done" bar on the first-use home |
| A2 | Runs locked until set-up is done | Run Payroll fully blocked until PAN, tax details and statutory steps are done | — | Partly: go-live readiness (`golive.service`) is advice only ("Switch payroll on" has no API); runs block per person (no salary, no bank) and block approval when a covered statute has no registration; a missing TAN only stops the TDS return | **Mix:** keep per-person checks; also block approval when the entity's TAN, PAN or a PT state registration is missing |
| A3 | Incomplete employee | Orange strip on the row, "n incomplete employees" count, own saved view, kept out of runs | — | Partly: run checks (`bank_missing`, `no_compensation`) and the Home "Not ready for payroll" card; nothing on the People list | **Take Z:** a "Not ready for payroll" view and row strip on People, fed by the same checks |
| A4 | Pay schedule | One schedule: work week, actual or fixed days, pay day; locked after the first run; next two runs shown | — | Has: pay groups (monthly, weekly, fortnightly), day basis, cut-off, pay day, versions from a date, calendar per year (PAY-16) | **Keep ours** |
| A5 | Payday on a holiday | Moves to the previous working day | — | Missing: pay date is period end plus N days, no holiday check (`setup.service`) | **Take Z** |
| A6 | Prior payroll | Set-up step 7 | — | Has: opening balances import and a parallel run signed off by a second person (PAY-16) | **Keep ours** |

## B. Salary

| # | Feature | Zoho Payroll | Keka | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Statutory flags per component | List columns EPF and ESI; edit ticks for taxable, pro-rata, show in payslip | — | Has: PF, ESI, PT, gratuity and bonus wage flags, labour-code wage part or exclusion, taxable, pro-rata, on payslip, in CTC (`starter.ts`, PAY-14 flag columns) | **Keep ours** (more flags, and the labour-code 50 % rule) |
| B2 | PF on an allowance only below the ceiling | Flag value "Yes, if PF wage is below ₹15,000"; option to count all components when LOP drops PF wage below it | — | Missing: a flag is on or off | **Take Z:** add the third flag value; it guards against allowance-splitting findings |
| B3 | Fixed Allowance as the balancing line | Monthly CTC minus all other lines, recalculated live | — | Has: a balancing component per template that also nets employer PF and ESI in CTC (`structure.ts`) | **Keep ours** |
| B4 | Salary templates | Click-to-add builder, annual CTC, live table | — | Has: PAY-13 per legal entity, formulas with a check, sample test employee, versions from a date | **Keep ours** |
| B5 | Salary revision with approval | Approvals list by payout month | Revisions tied to ratings | Has: PAY-12 revision with reason and preview, approved by a holder of pay rights; history with who asked and approved | **Keep ours** (approval levels in F2) |
| B6 | Revision letters | "Send Revision Letters", letter template | — | Has: revision letter with signatory (PAY-12) | **Keep ours** |
| B7 | Arrears | "Correction" component type (screen not seen) | — | Has: back-dated revision preview, PAY-28 arrears base, PAY-37 wage-settlement arrears, overpayment write-off | **Keep ours** |
| B8 | Reimbursements inside CTC (flexible benefits) | Monthly entitlement per component (phone, fuel, LTA), carry forward or encash, unclaimed becomes taxable | — | Missing: reimbursements are expense claims only (`exp_reimb`); no entitlement in the CTC | **Take Z:** common in Indian CTCs; the unclaimed part must be taxed |
| B9 | Scheduled earnings | "Scheduled Earning" on the profile | — | Has: recurring one-time pay with an end month (PAY-05, `calc.ts`) | **Keep ours** |
| B10 | Changing a component in use | Only name and amount; new amount for new people only | — | Has: template versions from a date; "on payslips since" (PAY-14) | **Keep ours** |

## C. Pay run

| # | Feature | Zoho Payroll | Keka | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Draft and calculate | Not seen (blocked) | — | Has: PAY-03 workspace, progress per person, retry failed, "why this number" drawer | **Keep ours** |
| C2 | Review | Not seen | — | Has: variance tab; changes above `payroll.variance_threshold_pct` confirmed before submit | **Keep ours** |
| C3 | Approve and lock | Not seen | — | Has: PAY-07 with typed phrase and second factor; the preparer and people paid by the run never approve | **Keep ours** |
| C4 | Pay or record payment | Direct deposit, or bank transfer, cheque, cash | — | Has: PAY-08 bank file made by one, released by another; PAY-10 results by row or file, cash and cheque, payment modes approved | **Keep ours** |
| C5 | Publish payslips | Payslip emails | — | Has: PAY-09 | **Keep ours** |
| C6 | Variable inputs | Variable pay report, scheduled earnings | — | Has: PAY-05 one-time pay (approval above a limit), PAY-32 incentives, PAY-31 piece rate, overtime | **Keep ours** |
| C7 | LOP and attendance import | LOP from Leave & Attendance (sync with Zoho People) | Loss of pay on the summary | Has: TIM-16 payroll feed, PAY-04 LOP with reason, attendance exceptions block approval | **Keep ours** (LOP reversal is attendance-leave D15) |
| C8 | Holds and skips | Hold Salary and Withheld Salary components, Salary Withhold report | — | Has: PAY-06 hold with reason, release into the next bank file; people with no salary left out | **Keep ours** |
| C9 | Pro-rated joiners | Pro-rata tick per component, actual days | — | Has: `payroll.mid_period.join` (segments, cut-off, or next-month arrears); PF ceiling per segment | **Keep ours** |
| C10 | Off-cycle runs | Off-cycle and one-time payslip email | — | Has: PAY-11 (bonus, arrears, correction, F&F) | **Keep ours** |
| C11 | Full and final settlement | Exit from the profile; notice pay, encashment, gratuity; F&F payslip and report (flow not seen) | — | Has: PPL-22 calculator, paid in a PAY-11 run (expenses-pay C3) | **Keep ours** |
| C12 | Reopen and void | Not seen | — | Has: PAY-49 reopen with two approvals; void with reason | **Keep ours** |

## D. Statutory

| # | Feature | Zoho Payroll | Keka | YukthiX today | Pick |
|---|---|---|---|---|---|
| D1 | EPF settings | 12 %, restrict to ₹15,000 or actual, employer share and EDLI and admin charges in CTC, rate override per person, LOP options | PF on the summary | Has: IN.PF rule (12 %, EPS 8.33 % up to ₹15,000, EDLI, admin charges, EPS stops at 58), PF on actual wage per person, employer PF in CTC option, VPF | **Keep ours** |
| D2 | EPF calculation preview | Three sample packages side by side, with a "15 days LOP" tick | — | Partly: template test employee (PAY-13) and suggest split (PAY-42); no LOP input | **Mix:** add LOP days to our test employee |
| D3 | ESI | 0.75 % and 3.25 %, ₹21,000 limit, kept to the end of the contribution period | ESI on the summary | Has: IN.ESI with contribution periods, PwD limit, round up | **Keep ours** |
| D4 | PT slabs per state | Card per work location; slabs auto-filled from the state, read only | PT on the summary | Partly: slabs for Karnataka, Tamil Nadu, Maharashtra, Telangana (Delhi has none) and the ₹2,500 cap; other states have no rule file | **Take Z:** rule files for every PT state; statutory first |
| D5 | LWF | Card per state with employee and employer amounts, enable per state | — | Partly: rule files for Karnataka, Tamil Nadu, Maharashtra, Telangana, Delhi; months shown on the registers | **Take Z:** every LWF state |
| D6 | Statutory bonus | 8.33 % to 20 % enforced; monthly or yearly; admin adds the minimum wage per state | — | Has: PAY-24 (allocable surplus, set-on and set-off, Form C, rules as settings); minimum wage from rule files, Karnataka and Tamil Nadu only (unsure what other states fall back to) | **Mix:** keep ours; let HR enter a state's minimum wage where no rule file exists |
| D7 | Gratuity | Earning component; F&F | — | Has: IN.GRATUITY rule, monthly provision, PAY-38 actuarial, provision report | **Keep ours** |
| D8 | Minimum wage and wage-code checks | — | — | Has: minimum-wage check on salaries and runs; labour-code 50 % wage add-back | **Keep ours** (neither has it) |
| D9 | Old vs new regime | Switch allowed; "Submit and Compare" after declaring | Note on the regime used | Has: PAY-41 compare with what-if, regime cut-off, then ask HR (expenses-pay B6) | **Keep ours** |
| D10 | New Income Tax Act names | "Section 123 (Earlier: 80C)", "Section 126 (Earlier: 80D)" and so on | — | Partly: switches to the 2025 Act from tax year 2026-27 (`tax.ts`); screens say "80C-equivalent"; the rule file says the new section numbers are still to be confirmed | **Take Z:** new number with the old one in brackets, once the CA confirms the numbers |
| D11 | Year-end certificate | Form 16: upload Part A, generate, sign, publish; "Form 138" named | Forms card with download | Has: Form 16 to 2025-26, Form 130 and Form 138 after (`taxForms`); CMP-06 Part A import, issue one or all, blocked until Q4 is filed. DSC signing not built | **Mix:** keep ours; add DSC signing |
| D12 | Challans, ECR and returns | Reports only: EPF ECR, ESI, PT, Form 24Q | — | Has: PF ECR, ESI, PT and LWF files; TDS challan with late interest; 24Q / 138 with FVU check; corrections; supplementary filing (CMP-01, 04, 05, 12) | **Keep ours** (far ahead) |
| D13 | Tax deductor set-up | PAN (mandatory), TAN, AO code, deductor picked from employees | — | Has: TAN, PAN and address on the legal entity; responsible person and designation on each registration (PAY-16 completeness) | **Keep ours** |
| D14 | Loan perquisite | Loan types with a perquisite rate; exemption tick for medical loans or small totals; perquisite reports | — | Missing: loans are interest-free by default and no perquisite is worked out; perquisites typed by hand | **Take Z:** work out the perquisite on cheap loans into TDS |
| D15 | Perquisites (12BA) | Perquisites on the profile and in reports | — | Has: perquisite records counted in tax; 12BA in Part B | **Keep ours** |
| D16 | Rule sources and coverage | — | — | Has: each rule cites its source; PAY-30 coverage monitor; CMP-08 advisories. Most India rules still say "verify" | **Keep ours**; have the CA clear "verify" before go-live |

## E. Employee side

| # | Feature | Zoho Payroll | Keka | YukthiX today | Pick |
|---|---|---|---|---|---|
| E1 | Declaration windows | Locked by default; admin releases and locks IT declaration and proofs company-wide | Window cards with an OPEN tag | Partly: dates from settings (`tax.regime_cutoff`, `tax.proof_window_opens`, `tax.proof_cutoff`); declaring stays open until the cut-off; no release or lock | **Mix:** keep the dates; add HR "Open now" and "Lock now"; cards as in expenses-pay B7 |
| E2 | HR declares for an employee | Admin fills the declaration on the employee's behalf | — | Missing: HR can set the regime only (`workspaces/:id/regime`) | **Take Z:** for staff without a login |
| E3 | Proofs of investment | Approvals by year and regime; "n yet to submit" nudge | Proof submission | Has: PAY-23 approve in part with comment, nobody checks their own, files checked (expenses-pay B8) | **Keep ours** |
| E4 | Proof rules | Attachments required; comment required on part approval; approved amounts used from a chosen month | — | Has: a file is needed to send; after the proof cut-off only verified amounts count, extra tax spread over the months left | **Keep ours** |
| E5 | Reimbursement ledger | Per employee and year: paid, approved unpaid, pending, unclaimed, with the formula | — | Missing (needs B8); expense claims show their own status | **Take Z** with B8 |
| E6 | Claim cut-off | Last day of the month to send bills, three email alerts | — | Has: `expense.payroll_cutoff_day` (approved after it go to the next payroll) | **Keep ours** |
| E7 | Loans and advances | Create loan with a paid-through account; repayments | — | Has: PAY-17 and PAY-18 request, approval, pause, pre-close, caps by months of gross | **Keep ours** |
| E8 | Payslips | Payslips and TDS sheets by year; Form 16 panel | Year, month list, download all | Has: PAY-21 with every line explained, queries, PDF | See expenses-pay B4 |
| E9 | Salary timeline | Salary details tab (admin) | Timeline of revisions with "Current" | HR side only (PAY-12) | See expenses-pay B3 |
| E10 | Employee portal | Off by default; invite; banner, quick links, document visibility | Full self-service | Has: every employee uses `/yx/me` (payslips, tax, declarations, loans, pay documents); a pay portal for alumni and nominees | **Keep ours** |

## F. Admin and control

| # | Feature | Zoho Payroll | Keka | YukthiX today | Pick |
|---|---|---|---|---|---|
| F1 | Pay run approval type | Simple, Multi-Level or Custom (rules on criteria) | — | Partly: fixed in code: two steps when two or more others can approve, else one; preparer and paid people never approve (`runs.service`) | **Mix:** keep maker-checker; add a per-entity setting for levels and an amount rule |
| F2 | Salary revision approval type | Same three choices, set apart from pay runs | — | Partly: one step by holders of pay rights (`employee-history`) | **Mix:** the same setting, separate for revisions |
| F3 | Approve and Pay as separate rights | Payroll Run: View, Create, Edit, Approve, Pay; Loan: Record Disbursement | — | Has: `payroll.run.prepare`, `run.approve`, `bankfile.generate`, `bankfile.release`, `payment.record`, `payslip.publish`, `loan.approve` | **Keep ours** |
| F4 | Activity log | Plain sentence, by user or System, "Show Versions" | — | Has: PAY-46 with pay values masked, a record's timeline, tamper check of the chain, recorded export | **Keep ours** (plain sentences in admin B1) |
| F5 | Payroll reports | 41 reports in 9 groups (overview, statutory, employee, declarations, deductions, taxes, loans, journal, logs); schedule, share, export | — | Partly: PAY-25 has 10 (salary register, reconciliation, variance, CTC by department, arrears, YTD, bank advice, hold ageing, gratuity provision, loan ledger); CMP-03 has 4 registers (EPF, ESIC, PT, LWF); Form C; journal | **Mix:** add LOP summary, TDS deduction, PT annual, perquisites, F&F, revision history, declarations and proofs, liability summary; schedules via admin E1 / E2 |
| F6 | Email templates | Four payslip emails | — | Has: wording editor (`/yx/settings/emails`); password-protected payslip emails (`payroll.payslip_email`) (unsure the payslip emails are in the editor) | **Keep ours** |
| F7 | Payslip and letter templates | Seven payslip designs, F&F payslip, salary certificate, revision letter, bonus letter | — | Has: PAY-15 layout editor with Hindi, Tamil, Telugu, Kannada; revision letter; salary certificate | **Keep ours** |
| F8 | Direct deposit and bank files | Paid payouts service and bank integrations (ICICI, HSBC, Axis) | — | Has: bank files in each bank's format, released by a second person, single-use links; no bank API | **Mix:** keep files; add one bank API later |
| F9 | Accounting | Zoho Books link; payroll journal report | — | Partly: journal lines and export (PAY-03, PAY-10); ledger mapping step designed only (PAY-16) | **Mix:** make the mapping step live; then a Tally export |
| F10 | Contractors | Separate module to switch on | — | Has: PAY-55 consultants with TDS, lower-TDS certificate, portal (PAY-56) | **Keep ours** |
| F11 | Payroll donations | Campaigns deducted from salary, donations report | — | Missing | **Skip:** rare; adds tax-receipt work |
| F12 | Leave and attendance inside payroll | Separate module; switching it on linked another account without saying so | — | Has: one product; attendance feeds payroll (TIM-16) | **Keep ours** (never link outside accounts without telling) |

## Counts

66 rows. 64 have a pick (E8 and E9 point to `compare-expenses-pay.md`):

| Keep ours | Take Z | Mix | Skip |
|---|---|---|---|
| 42 | 10 | 11 | 1 |

YukthiX is ahead on the run itself, filings, arrears, bonus, F&F and controls. Zoho is ahead on statutory breadth
(every PT and LWF state, loan perquisites, flexible benefits, the new Act's section names) and on set-up nudges.

## Suggested order to build

1. **Must (statutory first):**
   - D4 PT rule files for every PT state (M);
   - D14 loan perquisite into TDS (M);
   - D10 new Act section numbers with the old ones in brackets (S);
   - B2 "PF only below the ceiling" flag value (S);
   - A2 block approval when TAN, PAN or a PT registration is missing (S);
   - B8 and E5 flexible benefit reimbursements with the yearly ledger (L);
   - D5 LWF rule files for every LWF state (S);
   - E1 HR "Open now" and "Lock now" on declaration windows (S);
   - A3 "Not ready for payroll" view on People (S);
   - E2 HR declares on an employee's behalf (S).
2. **Depth:**
   - F1 and F2 approval levels per pay run and per revision (M);
   - D11 DSC signing of the year-end certificate (M);
   - D6 minimum wage typed per state for bonus (S);
   - F5 the missing payroll reports (M);
   - D2 LOP days on the test employee (S);
   - A5 payday moved off a holiday (S);
   - A1 set-up progress bar (S);
   - F9 ledger mapping live (M).
3. **Later:** F8 one bank API (L).
