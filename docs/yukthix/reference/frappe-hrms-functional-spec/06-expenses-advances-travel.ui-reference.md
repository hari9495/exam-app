# 06 · Expenses, Advances & Travel — UI Reference

> **Purpose.** How Frappe HR lays out expense claims, employee advances, travel requests and vehicle logs, as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [06-expenses-advances-travel.md](06-expenses-advances-travel.md) (behaviour) and [06-expenses-advances-travel.data-dictionary.md](06-expenses-advances-travel.data-dictionary.md) (fields).
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 20 screenshots (15 desktop + 5 mobile) in [`../ui-screens/06-expenses/`](../ui-screens/06-expenses/). Internal reference only.

## Demo data behind the screenshots

| Item | Setup |
|---|---|
| Claim types | Travel, Hotel, Food, Local Conveyance, Calls, Medical, Others, each mapped to a *workfox* expense account. Expense approver = Administrator for all employees. |
| **Priya's Mumbai trip** | Travel request (domestic, client meeting, 2 flight legs, hotel, costing ₹20,000) → advance **₹20,000**, paid in cash on 10 Sep → claim of 4 lines, **claimed ₹26,590, sanctioned ₹25,790** (hotel cut by ₹800), advance ₹20,000 allocated → **₹5,790 still to pay**. |
| Arjun | Draft claim, pending approval: 62 km customer visits ₹620 + business share of mobile bill ₹499. |
| Meera | Team-lunch claim ₹3,600 **rejected**. Advance ₹5,000 paid and not yet claimed; she is leaving on 19 Oct (module 05). |

**Set-up problems we hit (UI lessons):**
1. The company's default "Employee Advances" account ships typed as **Payable**, but advances require **Receivable**. Nothing flags this until the first advance fails.
2. Every expense line needs a **cost centre**. It doesn't default from the company, and the error only appears on submit.
3. Paying an advance needs an ERPNext **Payment Entry**. Linking it to a claim needs that payment's reference on the advance row, which the desk fills only when you use its "get advances" button.

---

## 1. Screen-by-screen

### 1.1 Expenses home — [01](../ui-screens/06-expenses/01-expense-workspace.png) · Dashboard [14](../ui-screens/06-expenses/14-expense-dashboard.png)
- **Layout:** sidebar (Dashboard, Employee Advance, Expense Claim, Travel ›, Accounting Entries ›, Reports ›, Setup ›, Settings). A claims-per-month chart and three cards for this month: claims 2, approved 1, rejected 1.
- **Observed:**
  - Counts only submitted claims: Arjun's pending draft is **not counted**, so the queue that matters most (waiting for approval) is invisible.
  - "Accounting Entries" sits in the HR sidebar.
- **YukthiX:** role-based home.
  - **Approver:** claims waiting for me, total ₹, oldest first.
  - **Finance:** approved and unpaid (₹), advances outstanding, ageing.
  - **Employee:** my open claims and my advance balance.

### 1.2 Claim list — [02](../ui-screens/06-expenses/02-expense-claim-list.png)
- **Observed:** list with status pills (Draft / Unpaid / Rejected). Unpaid and approved are two different concepts mixed into one status.
- **YukthiX:** separate columns for approval status and payment status, total ₹, number of receipts, policy flags.

### 1.3 Expense claim — approved with advance [03](../ui-screens/06-expenses/03-expense-claim-approved-advance.png), accounting tab [03b](../ui-screens/06-expenses/03b-expense-claim-accounting-tab.png), pending draft [04](../ui-screens/06-expenses/04-expense-claim-draft-pending.png), rejected [05](../ui-screens/06-expenses/05-expense-claim-rejected.png), new [06](../ui-screens/06-expenses/06-expense-claim-new.png)
- **Layout:**
  - Tabs: Expenses & Advances / Accounting / More Info / Dashboard.
  - Employee, name, department, company | expense approver, **approval status (a dropdown)**.
  - **Expenses grid:** date, type, description, amount, and a **sanctioned column squeezed to "S"** on a 1,440 px screen.
  - Collapsible taxes & charges and advance payments (advance, posting date, paid, unclaimed, allocated).
  - Totals stacked vertically: sanctioned, advance, grand total, claimed, taxes, reimbursed.
- **Observed:**
  - **No receipt per line.** Receipts can only be attached to the whole claim through the side-bar paperclip. The approver can't see which bill belongs to which line.
  - **No policy checks.** The ₹9,800 hotel had to be cut by hand to ₹9,000. There are no per-night, per-city or per-grade limits and no "exceeds policy" flag.
  - **The reason for the ₹800 cut is not recorded** on the line; the employee only sees a lower number.
  - Approval = change the status dropdown, then Submit (same issue as Leave U3). A rejected claim is still *submitted*, with sanctioned ₹0.
  - The totals order puts "Grand Total ₹5,790" (what is actually payable) between two other figures. Most users will read "Total Claimed ₹26,590" as the answer.
  - Mileage ("62 km") is typed into a description, with no rate × distance calculation.
- **YukthiX:** a **claim sheet**:
  - **Line = receipt.** Snap or upload → OCR reads date, merchant, amount and GST → category suggested.
  - Policy engine per category / grade / city: limits, per-diem, mileage rate × km (with optional map distance), receipt required above ₹X. Lines outside policy are flagged before submit.
  - The approver sees line by line with receipt preview: approve, reduce (reason required) or reject a line.
  - The summary reads: "Claimed ₹26,590 · approved ₹25,790 · less advance ₹20,000 · **you will receive ₹5,790** in the October payroll or by bank transfer".
  - Multi-level approval (manager → finance) through the shared approvals inbox (module 01).

### 1.4 Claim types — [07](../ui-screens/06-expenses/07-expense-claim-type.png)
- **Observed:** a name, a description and a per-company account table. **No limits, no receipt rule, no GST treatment.**
- **YukthiX:** an expense category = account mapping + policy (limits by grade/city, per-diem, mileage rate) + tax treatment (GST input credit eligible, taxable perquisite?).

### 1.5 Employee advance — list [08](../ui-screens/06-expenses/08-employee-advance-list.png), form [09](../ui-screens/06-expenses/09-employee-advance-form.png)
- **Layout:**
  - Connections: expense claim 1, payment entry 1, journal entry.
  - Employee, posting date, company, department; currency (collapsed).
  - Purpose & amount: purpose | advance amount, paid, pending, claimed, returned (each with help text).
  - Accounting: advance account, **"Repay unclaimed amount from salary"**.
- **Observed:**
  - The five amount fields (advance, paid, pending, claimed, returned) each have their own explanation but no single "balance ₹0 · settled" answer.
  - There is no link to the travel request it was for; the purpose is free text.
  - **Meera's unclaimed ₹5,000 advance does not appear in her F&F** ([module 05](05-employee-lifecycle.ui-reference.md) §1.6): the settlement was created earlier and does not refresh.
- **YukthiX:** an advance card showing a **balance ledger**: paid ₹20,000 → settled by claim −₹20,000 → balance ₹0, with the travel request linked. Unsettled advances surface automatically in F&F and as a warning in the payroll pre-flight ("recover ₹5,000 from Meera's final pay?").

### 1.6 Travel request — [10](../ui-screens/06-expenses/10-travel-request.png)
- **Layout:**
  - Travel type, funding | purpose; collapsed employee details and description.
  - **Itinerary grid:** from, to, mode, departure.
  - **Costing grid:** expense type, sponsored, funded, total.
- **Observed:**
  - It went straight to **Submitted**. There is no approval step or approver field.
  - **It is not connected** to the advance or the claim; the trip is just typed three times.
  - "Sponsored" vs "funded" wording is unclear. Lodging and advance flags hide inside itinerary rows.
- **YukthiX:** a **trip** is the parent of everything:
  1. Request with itinerary and estimate → approval.
  2. Advance requested from the trip.
  3. Bookings (optional travel-desk integration).
  4. Expenses collected during the trip (mobile).
  5. One claim at the end, with the advance deducted.

  A trip timeline shows every step.

### 1.7 Vehicle log (new) — [11](../ui-screens/06-expenses/11-vehicle-log-new.png)
- **Observed:** a company-vehicle log (licence plate, odometer, fuel, service) that needs ERPNext's Vehicle master. It is niche for SMB HR.
- **YukthiX:** out of the core UI. Mileage claims for *own* vehicles are covered by the policy engine (§1.3); fleet management is left for an add-on.

### 1.8 Reports — advance summary [12](../ui-screens/06-expenses/12-report-employee-advance-summary.png), unpaid claims [13](../ui-screens/06-expenses/13-report-unpaid-expense-claim.png)
- **Unpaid claims:** employee, claim, date, company, department, branch, **sanctioned ₹25,790**, paid ₹0, outstanding (off-screen to the right).
- **Observed:** the visible figure is the **sanctioned** amount, not the ₹5,790 actually owed after the advance. The outstanding column that answers the question is cut off at laptop width.
- **YukthiX:** a finance "to pay" view that lists net payable, due date and payout method, with **one-click bulk payout** (bank file / payout API) or "add to payroll".

### 1.9 Mobile — dashboard [m1](../ui-screens/06-expenses/m1-pwa-expense-dashboard.png), new claim [m2](../ui-screens/06-expenses/m2-pwa-expense-claim-new.png), claim detail [m3](../ui-screens/06-expenses/m3-pwa-expense-claim-detail.png), advances [m4](../ui-screens/06-expenses/m4-pwa-employee-advances.png), new advance [m5](../ui-screens/06-expenses/m5-pwa-employee-advance-new.png)
- **Layout (as Priya):**
  - **Dashboard:** summary card: total claimed ₹26,590 · pending ₹0 · approved ₹25,790 · **rejected ₹800**.
  - "Claim an Expense" button.
  - Recent expenses: "**Local Conveyance & 3 more** · 20 Sep · ₹26,590", with an "Approved & Unpaid" pill.
  - Advance balance: "You have no advances".
  - **New claim:** tabs Expenses / Advances / Totals; approver ("Administrator : Administrator"); "Expenses ₹0 +"; one attachments box for the whole claim; Save.
- **Observed:**
  - "Rejected ₹800" is really a **partial reduction** of an approved line. Calling it a rejection is misleading.
  - The claim is titled by one line's category ("Local Conveyance & 3 more") instead of the trip or purpose.
  - The **status pill text overflows its border** ("Approved & / Unpaid" on two lines).
  - "You have no advances" although Priya was paid ₹20,000 this month. It means "no open balance", but it reads as "you never received an advance".
  - The claim form is a small version of the desk form. There is no camera-first capture.
- **YukthiX (mobile-first flow):**
  - **Camera button** → receipt → OCR fills the line → pick trip or purpose → save as draft. Receipts can be added over days.
  - Submit when ready, with a policy check before sending.
  - Status timeline: submitted → approved (with any line cuts and reasons) → paid (UTR / payslip month).
  - An advance card showing paid, settled and balance, in plain words.

---

## 2. YukthiX Expenses screen inventory

| # | YukthiX screen | Based on Frappe | Notes / additions |
|---|---|---|---|
| 1 | Expenses home (employee / approver / finance) | 1.1 | Pending approvals and unpaid totals visible |
| 2 | Claim sheet (web + mobile, receipt per line, OCR) | 1.3, 1.9 | Policy flags, net payable in plain words |
| 3 | Approver view (line-level approve / reduce / reject with reason) | 1.3 | Shared approvals inbox, multi-level |
| 4 | Expense categories & policy | 1.4 | Limits by grade/city, per-diem, mileage, GST, taxable perquisites |
| 5 | Advance card with balance ledger | 1.5 | Linked trip; feeds F&F and payroll recovery |
| 6 | **Trip** (request → approval → advance → expenses → claim) | 1.6 | One parent record, timeline |
| 7 | Finance "to pay" + bulk payout / add to payroll | 1.8 | Bank file, payout status, UTR |
| 8 | Accounting export (Tally / Zoho / CSV) | 1.3 | No general ledger in YukthiX (module 03 §1.11) |

Items from the gap analysis in the functional spec (corporate card feeds, per-diem, GST input tracking, duplicate-receipt detection) attach to screens 2, 4 and 7.

---

## 3. UI issues seen on the instance (do not copy)

U1–U58 are in modules 01–05.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U59 | Set-up | Default advance account ships with the wrong type; cost centre required per line with no default; both found only on failure. | Pre-flight set-up check; sensible defaults. |
| U60 | Claim | No receipt per line; sanctioned column squeezed to "S". | Line = receipt; readable columns. |
| U61 | Claim | No policy limits; reductions have no recorded reason. | Policy engine; reason required when reducing. |
| U62 | Claim | Approval by status dropdown + Submit; "Unpaid" and "Approved" merged into one status. | Approve/reject actions; separate payment status. |
| U63 | Claim totals | Net payable (₹5,790) buried between claimed and sanctioned totals. | Lead with "you will receive ₹X". |
| U64 | Travel request | No approval; not linked to advance or claim. | Trip as parent record. |
| U65 | Advance / F&F | Unclaimed advance of a leaver not reflected in her F&F. | Live link from open advances to F&F and payroll recovery. |
| U66 | Unpaid claims report | Shows sanctioned, not net of advance; outstanding column off-screen. | Net payable first. |
| U67 | Dashboard | Pending (draft) claims not counted. | Show the approval queue. |
| U68 | Mobile | Partial cut shown as "Rejected ₹800"; claim titled by one category; status pill overflows; "no advances" after a paid advance. | Plain, accurate wording; trip/purpose titles; tested pill sizes. |

---

## 4. Capture notes

- **Demo data:** `yx_demo06.py` in the session scratchpad:
  - Claim-type accounts, expense approver, company payable account.
  - **The advance account type was changed to Receivable** on the instance.
  - Purpose of travel; two advances, paid via Payment Entries from Cash; travel request; three claims.
- **Temporary changes, all reverted 24 Sep 2026:**
  - API key (revoked).
  - Administrator linked to **Priya** for the mobile screens (unlinked).
  - A one-time login key (used once).
  - Default company (restored to *workfox (Demo)*).
- The expense data remains on the instance.
