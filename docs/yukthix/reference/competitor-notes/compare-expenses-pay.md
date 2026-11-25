# Compare: expenses, travel and pay (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (Me › Expenses & Travel, My Team › Expenses, My Finances) and `keka-map.md`;
- `zoho-pages.md` (Travel, Compensation, Settings › Compensation);
- YukthiX code on `test/yukthix-main` (EXP-01 to EXP-09, PAY and CMP screens), plus `gap-audit.md` (K16 to K19, Z7).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.

Note: both competitors were seen from an employee's side for pay. Keka's payroll run and Zoho Payroll (a separate
product) were not seen, so section C has few competitor cells. YukthiX is far ahead there; the rows are listed so the
count is honest.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. Expenses and travel

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Expenses to be claimed | Saved first, claimed later | — | Has (merged): a pool | **Keep ours** |
| A2 | Add an expense | Full screen: receipt preview left, fields right; save, save and add another, submit | Travel expense form | Partly: EXP-02 composer with the receipt beside each line; no "save and add another" | **Take K:** add "Save and add another" |
| A3 | Read the receipt | — | — | Has (switch): self-hosted reading and e-invoice QR, unsure fields flagged; off by default | **Keep ours** (neither has it); check it is on in production |
| A4 | Claims in process | Claim no., count, approved part, status, action by, waiting on | — | Partly: status badges; the approval timeline only on the claim page | **Take K:** a "Waiting on" column |
| A5 | Advances | Requests and settlements | — | Has: EXP-05 ledger, settle-by days, recovery, claim against an advance | **Keep ours** |
| A6 | Advance rules | Page hidden by policy, with a notice | — | Partly: limits matrix (EXP-07); advances have no cap or eligibility rule | **Take K:** advance on / off and a cap per grade, with a notice |
| A7 | Past claims | Paid-date range, payment mode, search | — | Partly: plain list, no filters | **Take K:** date and status filters |
| A8 | Travel | — | Travel request: place, dates, purpose, billable to customer | Has: EXP-04 trips, travel desk bookings, settlement | **Keep ours** |
| A9 | Manager approvals | Waiting, approved but unpaid, past | — | Has: `/yx/expenses/team`, over-limit filter, inbox | **Keep ours** |
| A10 | Finance payout | — | — | Has: EXP-06 to-pay via payroll or bank file, released by a second person | **Keep ours** |
| A11 | Company cards | — | — | Has: statement import and matching (EXP-08) | **Keep ours** |
| A12 | Mileage, per diem, city tiers | — | — | Has | **Keep ours** |
| A13 | GST and duplicate bills | — | — | Has: GSTIN check, e-invoice QR, duplicate by receipt | **Keep ours** (India input credit) |
| A14 | Expense reports | — | Travel lists | Has: EXP-09 with export | **Keep ours** |
| A15 | Phone capture | — | — | Partly: camera through the web page; phone screens designed only | **Keep ours:** make the drawn phone screens live |

## B. Pay and tax (employee)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | My pay summary | Last cycle, working days, loss of pay, view payslip | — | Partly: opt-in "Net pay" Home card; days strip on each payslip | **Take K:** a small summary at the top of My pay |
| B2 | Bank and statutory details | Bank, PF, ESI, PT; masked IDs with "Verified" | Masked identity fields | Has: masked UAN, ESIC, bank, with change requests | **Keep ours** |
| B3 | Salary timeline | Current pay, then revisions newest first with a breakdown | Behind an identity check (not seen) | Partly: HR side only (PAY-12) | **Take K:** an employee timeline with "Current" |
| B4 | Payslips | Year, month list, download all | — | Has (merged): year and month list; no "download all" | **Keep ours**; add "Download the year" |
| B5 | Income tax | Month grid with projected months | — | Has: PAY-22 `/yx/me/tax`, tax by month | **Keep ours** |
| B6 | Tax regime | Note on the regime used | — | Has: PAY-41 compare with what-if, cut-off, then ask HR | **Keep ours** |
| B7 | Declaration windows | Cards with dates and an OPEN tag | — | Partly: dates enforced; no cards | **Take K:** window cards |
| B8 | Proofs | Proof submission | — | Has: upload; HR approves in part or rejects (PAY-23); nobody checks their own | **Keep ours** |
| B9 | Previous employer income | Page with a help link | — | Has: Form 12B | **Keep ours** |
| B10 | Form 16 | Forms card with year and download | — | Has: Form 16 Part A and B as a pay document; 12BA inside Part B (unsure) | **Keep ours** |
| B11 | Tax filing and saving partners | Partner cards | — | Missing | **Skip:** links out, no value |
| B12 | Sign in again before salary | — | "Verify your identity" with a timeout | Partly: step-up for releases only | **Take Z:** shared office computers |

## C. Payroll (HR)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Payroll run with checks | — (not seen) | — (separate product) | Has: PAY-03 run with readiness checks | **Keep ours** |
| C2 | Statutory filings | — | — | Has: PF ECR, ESI, PT, LWF, TDS challan, 24Q (`/yx/payroll/statutory`) | **Keep ours** |
| C3 | F&F and gratuity | — | — | Has: PPL-22, leave encashment, gratuity | **Keep ours** |
| C4 | Loans and salary advance | — | — | Has: PAY-17, PAY-18 | **Keep ours** |
| C5 | Earned wage access | — | — | Has: employer-funded (PAY-26) | **Keep ours** |
| C6 | Payslip queries | — | — | Has: PAY-20 | **Keep ours** |
| C7 | Salary structures | — | Pay only or full breakup, round-off | Has: templates and components; flags the labour-code wage rule (PAY-13) | **Keep ours** |
| C8 | Revisions, letters, arrears | Revisions tied to ratings | Revision letter templates and reasons | Has: PAY-12 letters, PAY-28 arrears, PRF-10 raises | **Keep ours** |
| C9 | Statutory bonus | — | — | Has: PAY-24, Form C | **Keep ours** |
| C10 | Registers and reports | — | Compensation reports | Has: PAY-25, CMP-03 | **Keep ours** |

## Suggested order to build

1. **Must for daily use:**
   - B12 sign in again before salary pages (S);
   - B7 declaration window cards (S);
   - A4 "Waiting on" column (S);
   - A7 past-claim filters (S).
2. **Depth:**
   - B3 salary timeline (S);
   - B1 pay summary (S);
   - A2 "Save and add another" (S);
   - A6 advance rules (S);
   - B4 download the year (S).
3. **Later:** A15 phone capture live (M), A3 receipt reading switched on (S).
