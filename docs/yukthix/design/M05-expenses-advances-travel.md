# M05 · Expenses, Advances & Travel

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026 (gap register, user decision):** multi-currency expenses with FX (GAP B18) and field-force distance → mileage lines (GAP B2, M02 §B8); §11 B18 / B2.
> **Covers:** spec §1.3.7 (claims with policy limits, advances, travel requests and bookings, per-diem, reimbursement); Frappe reference [06](../reference/frappe-hrms-functional-spec/06-expenses-advances-travel.md) (defects EX-D1…D9, questions 1–6); UI reference 06 (U59–U68); Phase 2 items P1 receipt OCR, expense fraud checks, P2 GST per bill, corporate cards.
> **Build wave:** 5 (mobile-first, M04). Salary advances and loans stay in M03.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Approvals | P03 engine: amount-based routing, delegation, approve-with-changes where allowed (partial approval of a claim) | P03 Q1/Q5 |
| OCR and AI | Receipts are Internal class and use the P10 OCR / AI path (external AI allowed for receipts); ID documents stay in-region; data sent to external AI is tiered by sensitivity | P10 Q2 |
| Payouts | Bank files; payout API add-on | P10 Q5 |
| Accounting | Journal export to Tally, Zoho Books and CSV, plus Accounting API | P10 Q7 |
| Open advances at exit | Recovered in F&F (fixes U65) | M01 Q7 |
| Mobile | Offline drafts are submitted once online | M04 Q7 |
| Cost centres | The cost-centre split lives in the data model; a claim defaults to the employee's assignment cost centre | P01 Q8 |

---

## 1. Purpose & scope
Employees get their money back quickly and correctly; the company keeps spend within policy with a clean trail for finance and GST.

In scope:
- claims (receipts, mileage, per diem);
- policies;
- travel **trips** as parent records;
- expense advances (trip / imprest) with settlement;
- reimbursement;
- accounting.

Company vehicle logs are out of scope. Mileage claims cover personal vehicles; the fleet module comes later.

## 2. What exists today (exam app)
Nothing for expenses. We reuse:
- the approval engine;
- BlobStorage for receipts;
- AI providers for OCR (P10);
- exporters;
- the audit log;
- notifications.

## 3. Concepts
- **Category:** e.g. travel (air, rail, cab), lodging, meals, local conveyance, mileage, per diem, internet/phone, client entertainment, other. Each category has:
  - an accounting head;
  - a taxability flag (taxable perquisite vs exempt reimbursement, which feeds M03 TDS);
  - a GST-eligible flag;
  - whether a receipt is required.
- **Expense policy:** a set of rules assigned by entity, grade or designation, with dated versions (P06). The limit types are set in Q1.
- **Claim:** a report holding one or more **lines**. Each line has one receipt (fixes U60): date, category, amount claimed, amount approved plus a reason when reduced (fixes U61), city, GST fields (Q5), and payment mode (personal / company card / company paid).
- **Trip:** a travel request covering purpose, itinerary, estimated budget, advance requested and bookings (Q3). It is approved through P03. It is the parent of its advances and claims, so settlement is shown per trip (fixes U64, EX-D6).
- **Advance:** money given before spending, either for a trip or as standing imprest. It is settled by claims, returned by the employee, or recovered (Q6).
- **Net payable:** approved claims − advance adjusted. This is the headline figure on every screen: "You will receive ₹X" (fixes U63, U66).
- **Status and payment status** are separate: draft → submitted → approved / partly approved / rejected → **paid** / payment failed (fixes U62).
- **Currency (B18):** every line has a **receipt currency** (the currency on the bill) and is reimbursed in the employee's **pay currency** (the entity's payroll currency). A foreign-currency line stores the **FX rate**, its **source** and its **rate date**, and the converted amount. The company chooses the **FX source** (D17; starter template: the entity's central-bank reference rate — RBI for India entities — on the expense date, previous published rate on holidays): reference rate on the expense date / rate on the trip's advance (forex card load) / **actual rate from the card or forex statement** (with proof) / a company monthly rate table. The employee may enter the actual rate with proof; a difference above the company tolerance (starter 3 %) is flagged to the approver. Free public reference rates are included; a paid FX data feed, if a company wants one, is a third-party add-on (D18). **Per diem by country** already exists (`per_diem_rates`, Q1) and is paid in the pay currency or in the country's currency per the rate row.
- **Field-force distance (B2):** M02 §B8 sends each duty day's distance, vehicle type and visit list as a **draft mileage line** the employee confirms; it is then an ordinary mileage line (YX-EXP-03).

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `expense_categories` | Accounting head, taxability, GST flag, receipt rule, mileage / per-diem type |
| `expense_policies` + `expense_policy_rules` | Dated; rule: category × grade × city tier → limit per line / day / trip / month, receipt threshold, justification requirement |
| `city_tiers` | Tenant-editable list (Tier 1 / 2 / 3 + international) |
| `mileage_rates`, `per_diem_rates` | Per vehicle type / per city tier & country, dated |
| `trips` + `trip_legs` + `trip_bookings` | Travel request; bookings link to partner refs or uploaded tickets |
| `expense_claims` + `expense_lines` | Line: receipt file, OCR result JSON, claimed, approved, reduction reason, GST (supplier GSTIN, invoice no/date, taxable value, CGST/SGST/IGST), policy-check results, duplicate-check hash |
| `expense_advances` + `advance_settlements` | Advance → claim adjustments, returns, recoveries (instalments) |
| `expense_payments` | Route (payroll / direct), bank-file / payout ref, status |
| `card_transactions` | Corporate card statement lines, match status (wave 6, Q8) |
| `expense_lines` columns (B18) | `receipt_currency`, `receipt_amount`, `fx_rate`, `fx_source` (reference / advance / statement / company table / manual), `fx_rate_date`, `fx_proof_document_id?`, `fx_variance_flag`, `amount_pay_currency`; `field_day_distance_id?` (B2, M02) |
| `fx_rates` | Source, base / quote currency, rate date, rate; company monthly tables and imported reference rates (dated, B18) |
| `expense_advances` columns (B18) | `advance_currency`, `fx_rate`, `fx_source` — forex advances settled in their own currency (B18) |

All tables carry `organization_id` + RLS. Receipts are **Confidential** (P02); employees see their own, approvers and finance see those in scope.

## 5. Rules (YX-EXP)

| ID | Rule |
|---|---|
| YX-EXP-01 | Every line is checked against the employee's policy on its expense date: limit, receipt requirement, per-diem / mileage rate, category allowed for the grade. The results are shown on the line before submission and to the approver. |
| YX-EXP-02 | Over-limit lines follow Q7 and are never silently cut. When an approver reduces an amount, a reason is required and shown to the employee as "approved ₹X of ₹Y — reason" (fixes U61, U68). |
| YX-EXP-03 | A receipt is required above the category's threshold (Q4). Mileage (km × rate) and per-diem (days × rate) lines are computed, not typed. |
| YX-EXP-04 | Duplicate check: same employee, amount, date and merchant, or an identical receipt image hash, or the same GST invoice number from the same supplier across the tenant. These are flagged to the approver and finance; exact image duplicates are blocked. |
| YX-EXP-05 | Approvers come from the P03 chain on the server; a client-chosen approver is ignored (fixes EX-D3). Amount-based routing uses the claim total. |
| YX-EXP-06 | Net payable = approved − advance adjusted. It is the first figure shown on the claim, the list, mobile and reports (fixes U63, U66). |
| YX-EXP-07 | Payment status is separate from approval status. A claim is marked paid only when the payroll run is paid or the payout/bank file is confirmed (fixes U62). |
| YX-EXP-08 | Travel requests are available to all employees; a trip's approved advance creates the advance record automatically (fixes EX-D1, EX-D6). |
| YX-EXP-09 | Unsettled advances older than the settlement window (default 30 days after the trip ends) trigger reminders, then recovery per Q6. At exit, open balances go to F&F (fixes U65, EX-D9). |
| YX-EXP-10 | Taxable categories (per P07 and company settings) flow to M03 as taxable reimbursement; exempt ones do not affect TDS. |
| YX-EXP-11 | Approved claims post accounting lines (expense head, GST input when captured, cost centre, employee payable) exported via P10. |
| YX-EXP-12 | Claims are locked after payment; corrections are made with a new adjustment line (positive or recovery), never by editing a paid line. |
| YX-EXP-13 | Payment status follows M03 payroll outcomes: `payroll.run.paid` marks payroll-routed claims **paid** (emitting `expense.claim.paid`) and records the advance instalments recovered; `payroll.run.voided` returns those claims to **approved-unpaid**, queued for the next run; `payment.failed` sets the claim to **payment failed** and offers re-route (next payroll or direct payout); `recovery.deferred` shifts the advance's remaining instalments to the deferred period, keeping the open balance (to F&F if still open at exit, YX-EXP-09). Each transition is idempotent on the source event id. |
| YX-EXP-14 | **Multi-currency lines (B18):** a line in a foreign currency is converted to the pay currency using the company's FX source (starter: central-bank reference rate on the expense date), storing rate, source and rate date; an employee-entered actual rate needs proof (card / forex statement) and a difference above the company tolerance (starter 3 %) is flagged to the approver; policy limits are checked in the currency of the policy row (country per-diem rows in their own currency, others in the pay currency); the approver sees both amounts. Rates used on a paid claim never change. |
| YX-EXP-15 | **Forex advances (B18):** an advance issued in a foreign currency (cash or forex card) is settled in that currency against the trip's lines in the same currency; the unspent balance is returned or recovered at the rate of the company's FX source on the return / recovery date, and the exchange difference is shown as its own line on the settlement and posted to the company's exchange-difference account in the journal (P10 Q7). |
| YX-EXP-16 | **Field-force mileage (B2):** a draft mileage line created from M02 field-force distance is not submitted until the employee confirms or edits it (edits keep the system distance for the approver to compare); rates, limits and approvals are those of an ordinary mileage line; one draft per employee per duty day. |

## 6. Flows
1. **Snap-first claim (mobile):**
   1. Photograph the receipt.
   2. OCR pre-fills merchant, date, amount, GST.
   3. The employee confirms the category.
   4. The policy check shows inline.
   5. Add to an open claim (or to the trip's claim).
   6. Submit.
2. **Trip:** request (purpose, dates, legs, estimate, advance) → approval → booking (Q3) → advance paid → spend → claims against the trip → settlement view (advance vs spent → pay or recover).
3. **Approval card:**
   - lines with policy flags, duplicates and receipt thumbnails;
   - approve all, approve with changes (reason per line), send back, or reject.
4. **Payment:** approved → route per Q2 → paid → journal.
5. **Finance review queue:** optional final "audit" step for flagged claims (duplicates, missing GST, over limit) before payment.

**Events emitted:** `expense.claim.submitted`, `.approved`, `.rejected`, `.flagged`, `.paid`, `trip.approved`, `trip.booking.uploaded`, `advance.paid`, `advance.overdue`, `advance.recovery.scheduled`, `advance.settled`, `card.statement.imported` (wave 6); catalogue in [APX-B](APX-B-events.md) §2.13.

**Events consumed:** `payroll.run.paid` (claims routed via payroll → paid, emits `expense.claim.paid`; advance instalments recovered), `payroll.run.voided` (claims back to approved-unpaid, queued for the next run), `payment.failed` (claim → payment failed, re-routed), `recovery.deferred` (advance instalment schedule shifted; open balance kept, to F&F if still open at exit). YX-EXP-07, YX-EXP-13.

## 7. UI
- Mobile claim composer: one receipt per card, with a running "You will receive ₹X".
- Trip timeline.
- Desk claim review using T3 detail, with a receipt viewer beside the lines.
- Finance queue as a T2 list.
- Policy editor as a matrix: category × grade × tier.

Fixes U59–U68: pre-flight setup check, readable columns, accurate status wording, and titles taken from the trip or purpose.

## 8. Migration & rollout
- Open advances and unpaid claims are imported at go-live.
- Default policy templates are shipped (by grade band and city tier).
- Corporate cards follow in wave 6 (Q8).

## 9. Acceptance tests (samples)
- A ₹1,00,000 taxi claim with no receipt is blocked or flagged per policy (EX-D4).
- Two lines at different GST rates each keep their own tax (EX-D5).
- An approver cutting ₹800 must enter a reason; the employee sees "Approved ₹1,200 of ₹2,000 — hotel cap Tier 2" (U61, U68).
- The same receipt image uploaded by two employees is blocked on the second (YX-EXP-04).
- A trip advance of ₹10,000 with claims of ₹7,000 shows ₹3,000 to be returned or recovered; at exit it appears in F&F (U65).
- A claim approved but not yet in a paid payroll run shows "Approved — payment in October payroll" (U62).
- Neha's Dubai hotel bill of AED 1,200 on 12 Nov converts at the RBI reference rate for 12 Nov (the rate, source and date shown on the line) and is reimbursed in INR; she enters her forex-card rate instead with the statement, 4 % higher, and the approver sees the variance flag (YX-EXP-14; B18).
- A USD 500 forex advance with USD 420 spent leaves USD 80 to return; returned on 30 Nov, the settlement shows the INR value at the 30 Nov rate and a separate exchange-difference line (YX-EXP-15; B18).
- Vikram's 42 km field-force day appears as a draft mileage line; it is paid only after he confirms it and it is approved like any mileage line (YX-EXP-16; B2).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Which policy limit types at launch? | **All common ones:** per category × grade × city tier, limits **per line, per day, per trip and per month**; **mileage** (km × rate by vehicle type) and **per diem** (by city tier / country); receipt thresholds; templates shipped. |
| Q2 | How are approved claims paid? | **Both, company default:** through the **next payroll** (default; cut-off date) or **direct payout** (bank file / payout API) for urgent or high amounts; route selectable per category or by finance. |
| Q3 | Travel: request only, or bookings? | **Launch:** trip request + approval + advance + **upload of tickets / hotel bookings** (made by employee, admin or travel desk); **booking through a travel partner (TMC / booking API)** as an add-on in wave 6. |
| Q4 | Receipts and OCR | Receipt **mandatory above ₹500** by default (per category, configurable; below it a self-declaration); **OCR at launch** for every receipt (pre-fill, no auto-approval). |
| Q5 | GST capture for input credit | **Company option (off by default):** when on, lines in GST-eligible categories capture supplier GSTIN, invoice no./date, taxable value and tax split (OCR pre-fills; GSTIN format + state check); GST report for finance. |
| Q6 | Advance recovery if not settled | Reminders, then **recovery from salary in instalments** (default: up to 3, company sets); employee can also return by bank transfer; at exit → F&F. |
| Q7 | Claims over the policy limit | **Allowed with justification + an extra approval step** (e.g. department head / finance) for the excess; company can switch a category to **hard block**. |
| Q8 | Corporate cards | **Wave 6:** import card statements (CSV / bank format), auto-match to receipts, employee explains unmatched lines, personal spend recovered; live bank card feeds later via partners. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **All common limit types at launch:** category × grade × city tier, limits per line / day / trip / month; mileage (km × rate by vehicle type); per diem (city tier / country); receipt thresholds; shipped policy templates; dated policy versions (P06). | 25 Sep 2026 |
| Q2 | **Both routes, company default = next payroll** (claims approved before the payroll cut-off; paid to the reimbursement account if set, M01 Q4); **direct payout** (bank file / payout API) chosen by finance per claim, or set per category / above an amount. | 25 Sep 2026 |
| Q3 | **Launch:** trip request + approval + advance + upload of tickets / hotel bookings (by employee, admin or travel desk role), company-paid bookings recorded on the trip so they count against the trip budget but are not reimbursed. **Wave 6:** booking via travel partner (TMC / booking API) as a paid add-on. | 25 Sep 2026 |
| Q4 | **Receipt mandatory above ₹500** by default (per category, company-configurable); below it a self-declaration. **OCR at launch** on every receipt (merchant, date, amount, GST fields) via the P10 OCR path (receipts are Internal class, P10 Q2); OCR only pre-fills, never approves; OCR usage metered (AI credits). | 25 Sep 2026 |
| Q5 | **GST capture is a company option (off by default):** when on, GST-eligible lines capture supplier GSTIN, invoice no./date, taxable value, CGST/SGST/IGST (OCR pre-fill; GSTIN format + state-code check; company GSTIN per entity/state for the "billed to" check); GST input report and journal lines for finance. | 25 Sep 2026 |
| Q6 | **Reminders (P04), then salary recovery in instalments** (default up to 3, company sets; each instalment a one-time deduction in M03, protected net pay per YX-PAY-11); employee may repay by bank transfer (finance confirms); open balance at exit → F&F. | 25 Sep 2026 |
| Q7 | **Over-limit allowed with justification + an extra approval step** for the excess (default department head, configurable; e.g. finance) added to the P03 chain; company can set a category to **hard block**; over-limit counts shown in P09 spend analytics. | 25 Sep 2026 |
| Q8 | **Corporate cards in wave 6 via statement import** (CSV / bank formats): auto-match to receipts (amount, date, merchant), employee explains unmatched lines, personal spend recovered (Q6 route); until then card spend is claimed as a "company paid" line (not reimbursed). Live card feeds via partners later. | 25 Sep 2026 |
| F-follow-ups (consistency fix) | **Events aligned with APX-B §2.13 / §3 #4.** "Events emitted" completed (`expense.claim.rejected`, `.flagged`, `trip.booking.uploaded`, `advance.paid`, `advance.recovery.scheduled`, `advance.settled`, `card.statement.imported`); new "Events consumed": `payroll.run.paid` (claims paid), `payroll.run.voided` (back to approved-unpaid), `payment.failed` (claim payment failed), `recovery.deferred` (advance instalment schedule shifted). Rule YX-EXP-13. | 26 Sep 2026 |
| B18 | **Gap-register extension (user decision 26 Sep 2026): multi-currency expenses, wave 5.** Receipt currency + FX rate with a dated source chosen by the company (starter: central-bank reference rate on the expense date; alternatives: advance / forex-card rate, card or forex statement rate with proof, company monthly table), tolerance flag on employee-entered rates (starter 3 %); reimbursement always in the pay currency; forex advances settled in their own currency with an explicit exchange-difference line; per diem by country already exists (Q1). Public reference rates included; a paid FX feed is a third-party add-on (D18). Desk-UI i18n and WCAG parts of B18 stay with the UI brief. §3, §4, YX-EXP-14/15. | 26 Sep 2026 |
| B2 | **Gap-register extension (user decision 26 Sep 2026): field-force conveyance.** M02 §B8 daily distance arrives as a draft mileage line the employee confirms; ordinary mileage rules apply. §3, YX-EXP-16. | 26 Sep 2026 |
