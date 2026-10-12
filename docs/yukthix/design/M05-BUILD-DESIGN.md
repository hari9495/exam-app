# M05 · Expenses, advances and travel · Build design

> **Status:** ✅ Decided, 12 Oct 2026: the founder accepted D2–D9 with the recommended defaults and changed D1 to **self-hosted receipt OCR at launch** (PaddleOCR in an isolated worker, §14.6; §22). Batch E1 is being built on `feat/yukthix-expenses-1`. The module decisions (Q1–Q8, B18, B2) were taken on 25–26 Sep 2026 in [M05](M05-expenses-advances-travel.md); this doc turns them into tables, permissions, APIs, jobs, screens, tests and small pull requests.
> **Scope:** claims with receipts, mileage and per diem; policy limits as rule data; multi-level approval; advances and their settlement; travel requests and bookings (bookings through a partner seam, not built); corporate cards (a seam); the payroll hand-off (reimbursement in the payslip or a separate bank payout, recoveries, taxable portions) and the ledger hand-off; India GST input-credit capture; multi-currency.
> **Order:** six batches, **E1 → E6**. E1–E4 are what a pilot company needs (receipt OCR included in E2); E5 adds multi-currency, field-force mileage and reports; E6 holds the seams (travel partner, card feeds) that wait for a provider choice.
> **Builds on:** P03 approvals, P19 rules, P04 notifications, P05 documents and the 6a file store, M03 payroll (one-time pay, loans, bank formats, ledger mapping GP-PAY-1), G1 global core (country packs, translations), M01 (F&F hand-off).
> **Clean-room:** described in our own words from our own design docs and public law and guidance. No competitor text, screens or field names are copied. Frappe / ERPNext code is not read or copied.

---

## 1. How to read this doc

- **Section 2** lists what is already decided. Nothing there is asked again.
- **Sections 4–5** are the data model, by batch. Every table follows §5.1.
- **Sections 7–15** describe how each part works: policies, claims, approvals, trips, advances, payment, payroll, ledger, GST, currency, OCR, fraud, cards.
- **Section 21** is the build order: PR-sized slices with their tests.
- **Section 22** holds the decisions for the founder, each with a recommended default.

Words used here:
- **Pay currency:** the legal entity's payroll currency (`legal_entities.currency`).
- **Receipt currency:** the currency printed on the bill.
- **Company paid:** a cost the company already paid (a booked ticket, a card charge). It is recorded on the claim or trip so it counts against budgets, but it is never reimbursed.

---

## 2. Decisions this design follows

| Topic | Decision | Source |
|---|---|---|
| Policy limits | Category × grade × city tier; per line / day / trip / month; mileage by vehicle; per diem by tier or country; receipt thresholds; dated versions; starter templates | M05 Q1 |
| Payment route | Next payroll by default (before the cut-off), or direct payout chosen by finance per claim, per category or above an amount | M05 Q2 |
| Travel | Trip request, approval, advance, uploaded tickets and bookings at launch; partner booking later as a paid add-on | M05 Q3 |
| Receipts | Mandatory above ₹500 by default (per category); below it a self-declaration. OCR only pre-fills, never approves | M05 Q4 |
| GST | Company option, off by default: GSTIN, invoice number and date, taxable value, CGST / SGST / IGST per line; GST input report | M05 Q5 |
| Advance recovery | Reminders, then salary recovery in up to 3 instalments (company sets), within protected net pay; bank return; F&F at exit | M05 Q6 |
| Over limit | Allowed with justification and an extra approval step for the excess; a category can be a hard block | M05 Q7 |
| Corporate cards | Statement import in wave 6; until then card spend is a "company paid" line | M05 Q8 |
| Multi-currency | Receipt currency, dated FX rate and source; tolerance flag (3 %) on employee rates; forex advances settled in their own currency with an exchange-difference line | M05 B18 |
| Field-force mileage | Daily distance from M02 arrives as a draft mileage line the employee confirms | M05 B2 |
| Approvals | P03: server-side chains, amount routing, delegation; approve-with-changes only for types that allow it (expense lines, advance amount), each change with a reason | P03 Q1, Q5 |
| Ledger | Two-level mapping (company, then entity or cost centre); an unmapped bucket blocks posting | M03 §19.7 GP-PAY-1 |
| Exit | Open advances go to F&F | M01 Q7 |
| Paid add-ons | A seam with a dev fake; no paid SDK until the founder picks a provider | Lifecycle 6e pattern |

---

## 3. Scope

### 3.1 In
- Expense categories, city tiers, policies and rates as company data (P19 conditions, dated rows).
- Claims with lines (one receipt per line), mileage and per-diem lines computed by the system, company-paid lines.
- The policy check, duplicate and fraud checks, the risk flags shown to approvers and finance.
- Approval through P03 (manager chain, amount routing, the over-limit step, an optional finance audit step), with per-line reductions and reasons.
- Trips (purpose, legs, estimate, advance, bookings by upload) and the booking-partner seam.
- Advances (trip and standing imprest, INR and forex), settlement by claims, return by bank, recovery through payroll, F&F.
- Payment: next payroll (one-time pay) or direct payout (bank file from the payroll formats), payment status kept apart from approval status.
- Taxable portions to M03, exempt reimbursement kept out of gross pay.
- The expense journal, posted through the M03 ledger mapping.
- GST capture and checks (company option), the GST input report.
- Multi-currency lines and advances.
- The receipt-OCR seam (dev fake), the corporate-card seam (statement import interface).
- Reports: summary, unpaid, advance ageing, over-limit, GST input.

### 3.2 Out
- Booking through a travel partner (a seam only; wave 6, paid add-on).
- A cloud OCR provider (the adapter seam stays, so one can be added per customer later; §22 D1).
- Live corporate-card feeds (later, through partners).
- Company vehicle logs and fleet (a later module).
- Salary advances and loans (M03; this module only uses the loan engine for recovery, §11.3).
- GSTR-2B reconciliation and GST portal look-ups (a seam; needs a GST suvidha provider, §13.5).

---

## 4. Where it lives and what we reuse

**API:** a new `apps/api/src/expenses/` module.
- `expenses.module.ts`
- `policies.service.ts` (categories, tiers, policies, rates)
- `claims.service.ts` (claims, lines, receipts, the policy check)
- `checks.ts` (pure: limits, duplicates, fraud rules, GSTIN check)
- `trips.service.ts`
- `advances.service.ts`
- `payments.service.ts` (routes, payroll hand-off, direct payouts)
- `journal.ts` (pure: expense journal lines)
- `fx.service.ts`
- `adapters.ts` (OCR, travel partner, card feed seams)
- `expenses-jobs.ts`

**Web:** pages under `/yx/expenses/*`, wired to the existing prototype screens `packages/yx-ui/src/screens/ops/expenses*.tsx` (EXP-01 … EXP-09), which move to `screens/expenses/live/` like the lifecycle screens did.

| Need | Reuse | Note |
|---|---|---|
| Receipt storage, virus scan, MIME sniffing, SHA-256 | `FilesService.storeIn` (6a), area `expense` | Files are served through the API after the scope check, never by storage link |
| Approvals | `ApprovalsEngine.register` / `submit`, `skipIf`, `cost_centre_owner` resolver, delegation | Approve-with-changes is done on the M05 review screen before the engine decision (§9.2) |
| Policy conditions | P19 `parseGroup` / `evaluate` over a claim-line record | No new rule language |
| Dated settings | `settingFor(tx, c, key, scope, asOf)` and the settings registry | New `expense.*` keys (§6) |
| Notifications | `NotificationsService.notify` / `notifySystem`, types in `notification-types.ts` | APX-A PAY group |
| Events | `event_outbox` in the same transaction | APX-B §2.13 |
| Payroll input | `one_time_pays` with `source = 'm05'` (already allowed by the check) | §11 |
| Advance recovery | M03 `loans` engine (EMI, protected net, deferral, F&F) | One new loan type, §11.3 |
| Direct payout | `writeBankFile` and the published bank formats, exchange files, release with a second sign-in step | §10.3 |
| Journal | `ledger_mappings` and the `buildJournal` pattern (unmapped blocks posting) | §12 |
| Translations | G1 `content_translations` (category names) | §6.4 |
| Country data | G1 country packs (currency), P07 rule store (GST blocked-credit list, taxability) | §13, §14 |

**Changes outside M05** (small, owned by M03, listed so the payroll owner agrees before E3):
1. `pay_components` gets two starter components: `exp_reimb` (kind `reimbursement`, not taxable, no wage flags) and `exp_taxable` (kind `earning`, taxable, no wage flags).
2. The calculation keeps kind `reimbursement` on the payslip line. Today `calc.ts` turns every non-deduction one-time pay into an earning, so an exempt reimbursement would show inside gross pay. The payslip shows it under its own "Reimbursements" heading; it is outside gross and wage bases, and inside net pay.
3. The tax projection takes **taxable expense amounts already paid outside payroll** as an input, like `perquisites`, so a taxable line paid by direct payout still reaches TDS.
4. Payroll emits outbox events: `payroll.run.paid`, `payroll.run.voided`, `payment.failed` and `recovery.deferred`. Today they exist only as audit rows. They are in APX-B §2.12 already, and M05 consumes them (§11.4).
5. The `loans.loan_type` check gains `expense` (§11.3), through a new forward migration.

---

## 5. Data model

### 5.1 Rules for every new table
- `organization_id` on every row, composite foreign keys `(organization_id, id)`, and **forced RLS** with the `tenant_isolation` policy.
- Claim, line, receipt, trip, advance, payment and card tables also get the RESTRICTIVE **`support_session_excluded`** policy: a YukthiX support session never reads them. Config tables (categories, tiers, policies, rates) do not.
- Money is `DECIMAL(14,2)` in the stated currency, never a float. FX rates are `DECIMAL(18,8)`.
- Dated rows (`valid_from`, `valid_to`) never overlap for the same key (EXCLUDE gist), like P06.
- No hard deletes. Draft lines can be removed (soft `removed_at`); everything after submission is kept.
- Paid lines never change (YX-EXP-12, enforced by a trigger that refuses updates to money columns once `payment_status = 'paid'`).
- Status columns carry CHECK constraints listing their values.

### 5.2 Batch E1 · Setup and policies

| Table | Main columns | Notes |
|---|---|---|
| `expense_categories` | `code` (`^[a-z][a-z0-9_]{1,29}$`), `name`, `kind` (`spend` / `mileage` / `per_diem` / `company_paid_only`), `receipt_above` (amount, null = always), `gst_eligible`, `itc_blocked_reason` (null, or a P07 blocked-credit key, §13.3), `taxable` (`never` / `always` / `above_limit`), `ledger_code` (for the journal), `active`, `starter_key` | System starters are copied into the company (D17 pattern) |
| `city_tiers` | `name`, `rank`, `country`, `cities` (text[] of normalised names), `active` | Tier 1 / 2 / 3 and International ship as starters |
| `expense_policies` | `name`, `applies_if` (P19 group over employee fields: entity, grade, designation, location, department, employment type, custom fields), `priority`, `valid_from`, `valid_to`, `status` | Most specific, then priority, wins (like journey templates) |
| `expense_policy_rules` | `policy_id`, `category_code`, `tier_id` (null = any), `per_line`, `per_day`, `per_trip`, `per_month`, `currency`, `over_limit` (`justify_and_approve` / `block`), `needs_justification` | One row per category × tier; a missing row means the category is not allowed |
| `mileage_rates` | `vehicle` (`two_wheeler` / `car` / `ev_car` / …), `rate_per_km`, `currency`, `valid_from`, `valid_to`, `monthly_km_cap` | Dated |
| `per_diem_rates` | `tier_id` or `country`, `rate_per_day`, `currency`, `partial_day_rule` (`full` / `half_after_hours`), `meals_deduction` (json: share deducted per company-paid meal), `valid_from`, `valid_to` | Dated |
| `entity_gst_registrations` | `legal_entity_id`, `state` (two-digit GST state code), `gstin`, `valid_from`, `valid_to` | §22 D7; the entity's existing single `gstin` seeds one row |

### 5.3 Batch E2 · Claims, lines, checks

| Table | Main columns | Notes |
|---|---|---|
| `expense_claims` | `employee_id`, `employment_id`, `legal_entity_id`, `trip_id?`, `title`, `status` (`draft` / `submitted` / `sent_back` / `approved` / `partly_approved` / `rejected` / `withdrawn`), `payment_status` (`not_due` / `approved_unpaid` / `in_payroll` / `payout_queued` / `paid` / `payment_failed`), `route` (`payroll` / `payout` / null), `claimed_total`, `approved_total`, `advance_adjusted`, `net_payable` (all in pay currency), `risk` (`none` / `low` / `high`), `wf_request_id`, `submitted_at`, `decided_at`, `paid_at`, `version` | `net_payable = approved_total − advance_adjusted` (YX-EXP-06) |
| `expense_lines` | `claim_id`, `line_no`, `category_code`, `spent_on`, `merchant`, `city`, `tier_id`, `pay_mode` (`personal` / `company_card` / `company_paid`), `description`, `receipt_file_id?`, `self_declared`, `ocr` (json: fields read, confidence, adapter), `claimed`, `approved?`, `reduce_reason?`, `justification?`, `cost_centre_id`, `policy_result` (json, §7.3), `flags` (text[]), `dup_key` (hash, §15), plus the currency columns of §5.7 and the GST columns of §5.3.1, plus `mileage` (json: vehicle, km, from, to, `field_day_distance_id?`) and `per_diem` (json: from, to, days, meals provided), `removed_at` | One receipt per line (U60). Mileage and per-diem amounts are computed (YX-EXP-03) |
| `expense_line_changes` | `line_id`, `by`, `old_amount`, `new_amount`, `reason`, `step` | The approve-with-changes trail (P03 Q5) |
| `expense_flags` | `claim_id`, `line_id?`, `kind` (§15), `detail`, `status` (`open` / `cleared` / `confirmed`), `cleared_by`, `note` | Shown on the review screen; finance clears |

#### 5.3.1 GST columns on `expense_lines` (Q5, only when the company turns GST on)
`supplier_gstin`, `invoice_no`, `invoice_date`, `place_of_supply` (state code), `taxable_value`, `cgst`, `sgst`, `igst`, `cess`, `billed_to_gstin`, `itc_status` (`eligible` / `blocked` / `not_billed_to_us` / `wrong_state` / `missing` / `not_applicable`), `einvoice_irn?`, `einvoice_verified` (bool, §13.4).

### 5.4 Batch E3 · Payment

| Table | Main columns | Notes |
|---|---|---|
| `expense_payments` | `claim_id`, `route`, `one_time_pay_id?`, `payout_batch_id?`, `amount`, `status` (`queued` / `sent` / `paid` / `failed` / `returned`), `paid_on`, `ref` (UTR / payslip id), `source_event_id` (unique, §11.4) | One per payment attempt |
| `expense_payout_batches` | `legal_entity_id`, `exchange_file_id`, `format_key`, `total`, `row_count`, `status` (`draft` / `released` / `confirmed`), `generated_by`, `released_by` (≠ generated_by), `released_at` | Direct payouts; maker ≠ checker, second sign-in step to release |
| `expense_journals` | `legal_entity_id`, `period` (month), `kind` (`accrual` / `payout` / `advance` / `settlement`), `lines` (json), `unmapped` (json), `exports` (json) | Same "unmapped blocks posting" rule as the payroll journal |

### 5.5 Batch E4 · Trips and advances

| Table | Main columns | Notes |
|---|---|---|
| `trips` | `employee_id`, `purpose`, `from_on`, `to_on`, `domestic`, `estimate` (pay currency), `advance_requested`, `advance_currency`, `status` (`draft` / `submitted` / `approved` / `rejected` / `cancelled` / `closed`), `wf_request_id`, `version` | Parent of claims and advances (U64) |
| `trip_legs` | `trip_id`, `seq`, `from_city`, `to_city`, `country`, `depart_on`, `return_on`, `mode` (`air` / `rail` / `road` / `other`), `stay_nights`, `tier_id` | Per-diem tiers come from here |
| `trip_bookings` | `trip_id`, `kind` (`ticket` / `hotel` / `cab` / `visa` / `other`), `file_id?`, `provider_ref?` (partner seam), `amount`, `currency`, `paid_by` (`company` / `employee`), `booked_by` | Company-paid bookings count against the trip budget but are not reimbursed |
| `expense_advances` | `employee_id`, `employment_id`, `legal_entity_id`, `trip_id?`, `kind` (`trip` / `imprest`), `currency`, `amount`, `fx_rate?`, `fx_source?`, `status` (`requested` / `approved` / `paid` / `settling` / `recovering` / `settled` / `to_fnf`), `paid_on`, `settle_by`, `wf_request_id`, `loan_id?` (§11.3), `version` | Forex advances stay in their own currency (YX-EXP-15) |
| `advance_settlements` | `advance_id`, `kind` (`claim` / `return` / `recovery` / `fnf` / `exchange_difference`), `claim_id?`, `amount` (advance currency), `amount_pay_currency`, `fx_rate?`, `on`, `ref`, `confirmed_by` | The advance's ledger; open balance = amount − Σ settlements |

### 5.6 Batch E6 · Cards (seam)

| Table | Main columns | Notes |
|---|---|---|
| `card_accounts` | `employee_id`, `issuer`, `last4`, `currency`, `active` | No full card number, ever |
| `card_statement_imports` | `card_account_id?`, `file_id`, `adapter`, `period`, `row_count`, `status` | One per uploaded statement |
| `card_transactions` | `import_id`, `posted_on`, `merchant`, `amount`, `currency`, `match_status` (`unmatched` / `matched` / `explained` / `personal`), `line_id?`, `explanation`, `recovery_advance_id?` | Personal spend is recovered like an advance (Q8) |

### 5.7 Currency (E5, on `expense_lines`; B18)
`fx_rates` (`source` (`fbil` / `ecb` / `company`), `base`, `quote`, `rate_date`, `rate`, `imported_at`; unique on source, base, quote and rate date) comes with E5, where it is first used (moved from E1 when E1 was built).

`receipt_currency` (ISO 4217), `receipt_amount`, `fx_rate`, `fx_source` (`reference` / `advance` / `statement` / `company_table` / `manual`), `fx_rate_date`, `fx_proof_file_id?`, `fx_variance_pct`, `fx_flag` (bool). `claimed` and `approved` are always in the pay currency. A line in the pay currency has rate 1, source `reference`, and no proof.

### 5.8 RLS summary

| Table group | `tenant_isolation` | `support_session_excluded` | Who reads (enforced in the API, §16) |
|---|---|---|---|
| Config (categories, tiers, policies, rules, rates, fx_rates, GST registrations) | yes | no | All employees read categories and their own limits; editors hold `expense.policy.manage` |
| Claims, lines, line changes, flags | yes | yes | Owner; approvers with an open or past task on the claim; holders of `expense.claim.view` in scope; finance with `expense.finance.review` |
| Trips, legs, bookings | yes | yes | Owner; approvers; travel desk (`travel.booking.manage`); `expense.claim.view` in scope |
| Advances, settlements, payments, payout batches, journals | yes | yes | Owner (own advances and payments); finance (`expense.payout.manage`); journals only finance |
| Card tables | yes | yes | Cardholder; finance (`expense.card.manage`) |

`rls-isolation.e2e-spec.ts` gains an `EXPENSES_SUPPORT_EXCLUDED` list like the lifecycle one.

---

## 6. Company settings and starter data

### 6.1 Settings registry keys (`expense.*`)

| Key | Scopes | Starter value |
|---|---|---|
| `expense.route.default` | tenant, entity | `payroll` |
| `expense.route.payout_above` | tenant, entity | none (every claim to payroll) |
| `expense.payroll_cutoff_day` | tenant, entity | the M03 run cut-off |
| `expense.claim_window_days` | tenant, entity | 60 (older lines need the finance step, §15) |
| `expense.finance_audit` | tenant, entity | `flagged_only` (`off` / `flagged_only` / `all` / `sample_10pct`) |
| `expense.gst.capture` | tenant, entity | off (Q5) |
| `expense.fx.source` | tenant, entity | `reference` (§14) |
| `expense.fx.tolerance_pct` | tenant | 3 (B18) |
| `expense.advance.settle_days` | tenant, entity | 30 after the trip ends (YX-EXP-09) |
| `expense.advance.recovery_instalments` | tenant, entity | 3 (Q6) |
| `expense.ocr.enabled` | tenant | on (self-hosted OCR, §14.6); a company may turn it off |

### 6.2 Starter templates (YukthiX starters, copied and never overwritten)
- **Categories:** air, rail, cab and local conveyance, lodging, meals, mileage, per diem, internet and phone, client entertainment, visa and fees, other. Each has a GST-eligible flag and, for India, the blocked-credit key from the P07 pack (§13.3).
- **City tiers:** Tier 1 (the large metros), Tier 2, Tier 3, International. The city lists are editable data, not law.
- **Policies:** one company-wide starter policy with the M05 Q1 limit types filled in for each tier. Grade ids differ per company, so a starter cannot name grade bands; the company copies the policy and narrows each copy to a band with "Applies to" (built in E1).

Starter amounts are examples a company replaces, written in our own words and not taken from any vendor.

### 6.3 Pre-flight check (fixes U59)
`GET /expenses/setup-check` lists what blocks claims: no active policy for some employees, a category with no ledger code, a missing mileage rate for a vehicle in use, GST on but no GST registration for an entity, and so on. The Expenses home shows it to finance and HR until it is empty.

### 6.4 Translations (G1)
Category and tier names use G1 `content_translations` with two new subject types, `expense_category` and `city_tier`. This is a G1-owned check change, done in a forward migration inside E1.

---

## 7. Policies as rule data

### 7.1 Finding the employee's policy
- On the **expense date** of each line, the active policy rows whose `applies_if` P19 group passes for the employee's record (assignment on that date: entity, grade, designation, location, department, employment type, custom fields) are candidates.
- The most specific wins: the most fields used in `applies_if`, then the lowest `priority`.
- No match is a setup error (§6.3) and the line shows "No expense policy applies to you yet; HR is told."

### 7.2 Limits
- **Per line:** the line amount (pay currency, or the rule's currency for country per-diem rows) against `per_line`.
- **Per day / per trip / per month:** the sum of the employee's approved and pending lines of that category in the window, plus this line. A line split across days counts on its own date.
- **Mileage:** `km × rate` from `mileage_rates` on the date, with the monthly km cap. The amount cannot be typed (YX-EXP-03).
- **Per diem:** `days × rate` by tier or country. Partial days follow `partial_day_rule`, and `meals_deduction` reduces the rate for company-paid meals. Days come from the trip legs or the line's from/to.
- **Receipt:** required when `claimed > receipt_above` and the category is not computed. Below it, the employee ticks a self-declaration.

### 7.3 The check result (stored on the line, shown before submit and to the approver)
`{ policyId, ruleId, limit: { kind, amount, currency, used, remaining }, receipt: 'required' | 'declared' | 'ok', overBy, outcome: 'ok' | 'over_justify' | 'blocked' | 'not_allowed' }`.
The check is a pure function in `checks.ts` with unit tests; the service only loads the data.

### 7.4 Over limit (Q7)
- `over_justify`: the employee must write a justification. The claim's P03 request gets an **extra step** for the excess (default: department head; configurable to a user group such as finance). It is skipped by `skipIf: { over_limit_total: { eq: 0 } }`.
- `blocked`: the line cannot be submitted above the limit; the employee may claim up to the limit.
- Approvers never silently cut (YX-EXP-02). A reduction is an approve-with-changes with a reason (§9.2).

---

## 8. Claims

### 8.1 Composing (EXP-02)
1. **Snap first.** Upload or photograph a receipt (PDF, JPG, PNG, HEIC converted server-side; up to 10 MB). It is stored through `FilesService` (area `expense`, virus scan, MIME sniffing). The file's SHA-256 feeds the duplicate check at once.
2. **Pre-fill.** If OCR is on, the OCR adapter (§14.6) reads merchant, date, amount, currency and GST fields. Pre-fill only: the employee confirms each value. If the receipt carries a GST e-invoice QR code, it is read first (§13.4).
3. **Category and details.** Mileage and per diem show their own fields and compute the amount.
4. **Inline policy check** (§7.3) and inline flags (§15) on each line card.
5. **"You will receive ₹X"** is always visible: approved-so-far (claimed while draft) minus the advance that will be adjusted (YX-EXP-06).
6. **Submit.** The server re-runs every check, freezes the policy results, writes `expense.claim.submitted` and starts the P03 request.

**Offline (M04 Q7):** drafts are made on the phone and submitted once online. The server treats the upload as a normal submit, so nothing is trusted from the device.

### 8.2 Which claim a line goes on
- Lines inside a trip's dates go on the trip's open claim, unless the employee says the line is not trip spend.
- Other lines go on the employee's open "Expenses for {month}" draft, or a new titled claim.

### 8.3 After payment (YX-EXP-12)
A paid claim is locked. A correction is a **new adjustment claim** with a positive line, or a recovery line that becomes a one-time deduction, linked to the original. It is never an edit.

---

## 9. Approvals (P03)

### 9.1 Request types
`expense.claim` (normal risk; high risk when over a company amount), `expense.trip`, `expense.advance` and `expense.advance.recovery_waiver`. Registered in `onModuleInit` like leave.

The claim request's steps:
1. **Manager** (`{ kind: 'manager' }`).
2. **Cost-centre owner** above a company amount (`{ kind: 'cost_centre_owner', field: 'cost_centre_id' }`, skipped below the amount).
3. **Excess approver** for over-limit lines (§7.4).
4. **Finance audit** (§9.3).

The steps come from the company's P03 chain for `expense.claim`; a client-chosen approver is ignored (YX-EXP-05, EX-D3). Self-approval is `never`. `distinctSteps` is on, so whoever approved one step never approves a later one.

### 9.2 Approve with changes (P03 Q5)
The engine decides approve / reject. Line changes are made on the M05 review screen (EXP-03) by the **holder of the open task**, before they press Approve:
- `PATCH /expenses/claims/:id/lines/:lineId/approve-amount { amount, reason }` checks that the caller holds an open task on the claim's request, that `0 ≤ amount ≤ claimed` and that the reason has at least 3 characters. It writes `expense_line_changes` and recomputes totals.
- When the last step approves, `onDecided` sets `approved` on the remaining lines, then `status = approved`, or `partly_approved` if any line was reduced. The employee sees "Approved ₹1,200 of ₹2,000: hotel cap Tier 2" (U61, U68).
- **Send back** is a reject with `sent_back` meaning: the claim returns to the employee with the reason, and resubmitting restarts the chain (P03 Q7).

### 9.3 Finance audit step
Per `expense.finance_audit`, a finance user-group step is added for flagged claims (default), all claims, or a 10 % random sample. Finance sees the flags with "clear" or "confirm" per flag. A confirmed duplicate rejects the line.

### 9.4 Trips and advances
- **`expense.trip`:** the manager, then the travel desk group when bookings are requested. On approval: `trip.approved`; an advance record is created if one was requested (YX-EXP-08); the travel desk is told.
- **`expense.advance`:** the manager, then finance. Approve-with-changes is allowed on the amount only.

---

## 10. Payment

### 10.1 Route (Q2)
The route is set at approval, from the most specific of:
1. finance's choice on the claim;
2. the category route;
3. `expense.route.payout_above`;
4. `expense.route.default`.

The employee sees where the money will come from: "Approved: payment in the October payroll" (U62), or "Approved: bank transfer queued".

### 10.2 Next payroll
- A claim approved before `expense.payroll_cutoff_day` becomes **one-time pay** rows for that month's period:
  - `source = 'm05'`, `source_ref = claim id`, `status = 'approved'` (no second approval in M03);
  - one row for the exempt part (`exp_reimb`) and one for the taxable part (`exp_taxable`, §11.2);
  - minus the advance adjusted.
- The claim's `payment_status` becomes `in_payroll`. After the cut-off, the claim goes to the next month.
- The money goes to the employee's **reimbursement bank account** if one is set (`employee_bank_accounts.purpose = 'reimbursement'`, M01 Q4); otherwise to the salary account. This needs the payout to split by purpose: an M03 item, listed in §4 when built.

### 10.3 Direct payout
- Finance picks approved claims on **To pay** (EXP-06) and generates a payout batch per entity in a published bank format (`writeBankFile`). The rows are employee, reimbursement or salary account, amount and reference.
- **Release:** a different person releases it with a second sign-in step. The hash, row count and total are checked again, like the payroll bank file.
- **Results:** the bank response file or manual rows set each payment to `paid` or `failed`. A failure offers "next payroll" or "pay again after the bank details are fixed".
- A taxable portion paid this way is reported to M03 as taxable already-paid income (§4 change 3), so TDS stays right.

### 10.4 Status (YX-EXP-07, YX-EXP-13)
`payment_status` changes only on:
- `payroll.run.paid` (`in_payroll` → `paid`, emits `expense.claim.paid`);
- `payroll.run.voided` (→ `approved_unpaid`, queued for the next run);
- `payment.failed` (→ `payment_failed`, re-route offered);
- payout batch results.

Every transition is idempotent on the source event id (`expense_payments.source_event_id` unique).

---

## 11. Payroll hand-off (M03)

### 11.1 What payroll receives

| From M05 | Into M03 | Effect |
|---|---|---|
| Approved claim, exempt part | `one_time_pays` with `exp_reimb` (kind `reimbursement`, not taxable) | Shown under "Reimbursements" on the payslip; outside gross, PF / ESI / PT / bonus / gratuity wages; inside net pay |
| Approved claim, taxable part | `one_time_pays` with `exp_taxable` (earning, taxable, no wage flags) | Counted in the TDS projection; not a wage for PF / ESI |
| Taxable part paid by direct payout | taxable-already-paid input | TDS only; nothing paid twice |
| Advance recovery | a `loans` row of type `expense` | EMI per run within protected net and the legal cap; deferral raises `recovery.deferred` |
| Personal card spend to recover (E6) | the same as an advance recovery | Same as an advance |
| Open advance at exit | `advance.settled` with `to_fnf`, read by the F&F run | Recovered in F&F (M01 Q7, U65) |

### 11.2 Taxable portions
The category's `taxable` value decides how a line is treated:
- `never`: reimbursement of business spend with bills;
- `always`: for example a fixed allowance paid as a claim;
- `above_limit`: the part above the policy limit is taxable when the company pays it anyway.

The defaults and their legal basis are P07 rule data the compliance owner confirms (§19.2). Each claim's split is stored on the line (`taxable_amount`), so the payslip and Form 16 match the claim.

### 11.3 Advance recovery through the loan engine
When an advance becomes overdue and the employee has not returned it:
1. M05 creates a `loans` row with `loan_type = 'expense'`, principal = open balance in the pay currency, EMI = balance ÷ instalments, `first_month` = the next open period, `perquisite = false`, no interest, `status = 'active'`. No second approval: the recovery was agreed in the advance policy the employee accepted when taking the advance (Q6).
2. M03 recovers it in deduction order with loans (§8.4 step 4), stops at protected net, and defers what does not fit.
3. M05 listens for repayments (`loan_repayments` rows on `payroll.run.paid`) and writes `advance_settlements` of kind `recovery`.
4. An employee can still return the money by bank. Finance confirms it, the loan is closed early by the amount, and a settlement is written.

This reuses tested payroll code (ordering, protected net, deferral, F&F) instead of a second recovery engine (§22 D4).

### 11.4 Events consumed (idempotent)

| Event | M05 does |
|---|---|
| `payroll.run.paid` | Claims whose one-time pay rows are on paid payslips → `paid`; advance recoveries recorded |
| `payroll.run.voided` | Those claims → `approved_unpaid`; their one-time rows are cancelled and re-created for the next period |
| `payment.failed` | The claim → `payment_failed`; finance is told; re-route offered |
| `recovery.deferred` | The advance keeps its open balance; the employee is told the new schedule |
| `employee.exit` (M01) | Open advances → `to_fnf` |

Until M03 emits these events (§4 change 4), E3 cannot mark payroll-routed claims paid. E3 depends on that change.

---

## 12. Ledger hand-off

### 12.1 Entries (all through `ledger_mappings`, unmapped blocks posting)

| When | Debit | Credit |
|---|---|---|
| Claim approved (accrual) | Expense head per category (`exp.<category>`), split by the line's cost centre | Employee reimbursements payable (`exp._payable`) |
| …with GST captured and ITC eligible | GST input CGST / SGST / IGST (`exp._gst_in_*`) instead of the expense head for the tax part | (same) |
| Paid in payroll | Payroll journal: the `exp_reimb` / `exp_taxable` components map to `exp._payable` (clearing) | Payroll net pay / bank |
| Paid by direct payout | `exp._payable` | Bank (`exp._bank`, per entity) |
| Advance paid | Employee advances (`exp._advances`) | Bank |
| Advance settled by a claim | `exp._payable` | `exp._advances` |
| Advance returned or recovered | Bank or the payroll loan line (mapped to `exp._advances`) | `exp._advances` |
| Forex difference on settlement | FX loss (`exp._fx_loss`) or `exp._advances` | `exp._advances` or FX gain (`exp._fx_gain`) |
| Company-paid lines | Expense head | Company card clearing (`exp._card`) |

### 12.2 How it is built
- `journal.ts` is a pure function, like payroll's `buildJournal`: claims and settlements in, balanced lines out, unmapped listed. It is tested directly.
- The component codes live in the existing `ledger_mappings` table (`component_code` up to 30 characters), with the `exp.` prefix. Finance maps them on the existing ledger-mapping screen, which gains an "Expenses" group.
- Journals are made **per entity per month** and exported through the P10 exporters (Tally XML, Zoho Books, CSV), with "mark posted". A month with unmapped lines cannot be exported (GP-PAY-1).

---

## 13. India GST input credit

From public sources (the CGST Act, 2017 and the GST portal's guidance), in our own words. The law values are P07 rule data with the `verify` flag until the compliance owner signs off.

### 13.1 When credit can be claimed
- Credit on a business expense needs a **tax invoice that names the company's GSTIN** as the buyer. A bill in the employee's own name gives no credit, even for business spend.
- The supplier must have reported the invoice, so that it appears in the company's auto-drafted inward statement (GSTR-2B).
- There is a **time limit**: broadly, credit for a financial year must be taken by the 30 November after the year ends, or the annual return date if earlier. Lines from last year's spend are flagged to finance as that date nears.

### 13.2 Which state's registration
- Tax is **CGST + SGST** when supplier and place of supply are in the same state, and **IGST** when they differ.
- For lodging, the place of supply is where the hotel is. A hotel in another state charges that state's CGST + SGST. The company can claim it only through its registration in that state.
- Hence the **billed-to check**: the invoice's buyer GSTIN must be one of the entity's registrations (`entity_gst_registrations`), and its state must suit the place of supply. Otherwise `itc_status` is `not_billed_to_us` or `wrong_state`, and finance sees how much credit was lost.

### 13.3 Blocked credits
The Act blocks credit on some kinds of spend whatever the invoice says. Examples are food and drink, outdoor catering, beauty and health services, club memberships, and travel benefits for employees on holiday; some motor-vehicle and cab spend is blocked with exceptions. These are a **blocked-credit list in the P07 India pack**, linked from each category (`itc_blocked_reason`). The line then shows "GST captured; no input credit for this kind of spend".

### 13.4 Checks on the GST fields
- **GSTIN format and check digit:** 15 characters, made of the 2-digit state code, the 10-character PAN, the entity number, a fixed letter, and a check character computed from the first 14. All of it is checked offline.
- **State code** must be a valid GST state code.
- **Tax maths:** CGST = SGST, and IGST is not combined with them; tax ÷ taxable value must be one of the published rates (rule data).
- **E-invoice QR:** large suppliers issue B2B e-invoices with an IRN and a QR code signed by the invoice registration portal. When the receipt shows that QR, we decode it and check the signature against the portal's published public key. A valid QR gives supplier GSTIN, buyer GSTIN, invoice number, date and value **without OCR**, and is strong proof against altered receipts. Decoding uses a maintained open-source QR library; there is no paid service (§22 D1).
- **GSTIN active status and the GSTR-2B match** need a GST Suvidha Provider or the portal API. They are a seam only (§3.2), off until a company buys access.

### 13.5 Report
The GST input report (EXP-09) is by entity, state, month and supplier. It shows eligible, blocked, not-billed-to-us and wrong-state amounts, and exports a CSV in the GSTR-2B column order, so finance can reconcile outside YukthiX.

### 13.6 Record keeping
GST law asks registered persons to keep records for **72 months** from the due date of the year's annual return. Receipts linked to claimed credit follow a P05 retention rule of at least that long (rule data, verify).

---

## 14. Currency and FX (B18, global use)

### 14.1 What is stored
Every line keeps the receipt currency and amount, the rate, its source and date, and the pay-currency amount (§5.7). A paid claim's rates never change.

### 14.2 Rate sources (company choice, `expense.fx.source`)

| Source | What it is | Use |
|---|---|---|
| `reference` | The official reference rate for the pay currency. For INR this is the **FBIL** reference rate: since July 2018 Financial Benchmarks India publishes the INR reference rates that the RBI used to publish (M05 says "RBI", corrected here). FBIL covers a few major currencies; others go through a cross rate via USD or EUR. For other pay currencies, the country pack names the central bank or the ECB euro reference rates. | Starter |
| `advance` | The rate of the trip's forex advance or card load | Forex trips |
| `statement` | The rate on the employee's card or forex statement, with the statement uploaded as proof | Card spend |
| `company_table` | A monthly rate table finance keeps | Companies that close books on a fixed rate |
| `manual` | An employee-entered rate with proof | Flagged when it differs from the reference by more than the tolerance (3 %) |

- **Holidays and weekends:** the last published rate before the expense date.
- **Import:** a daily job pulls the free published files (FBIL, ECB) into `fx_rates`. If a source is down, the last rate is used and the line says how old it is. A paid FX feed is a third-party add-on (D18). Each source's terms of reuse are checked before the job is switched on (§22 D2). **As decided 12 Oct 2026:** only the company table at the pilot; a paid, licensed feed before the global launch; ECB and FBIL off.
- **Accounting basis:** accounting standards (Ind AS 21 and its global twin) record a foreign-currency transaction at the spot rate on its date, or an average rate for a period when rates move little. The `reference` and `company_table` options cover both.

### 14.3 Policy limits in other currencies
A limit is checked in the currency of its rule row: country per-diem rows in their own currency, the rest in the pay currency. The approver sees both amounts (YX-EXP-14).

### 14.4 Forex advances (YX-EXP-15)
A USD advance is settled by USD lines at the advance's rate. The unspent balance is returned or recovered at the rate on the return or recovery date, and the difference is an `exchange_difference` settlement and journal line.

### 14.5 Country packs (G1)
The pack's currency is the default pay currency. A country pack can ship expense starters (categories, tiers, per-diem rates by country and the GST-like tax fields). Only India ships them now; a new country's pack adds them later (gap pass O4 pattern).

### 14.6 Receipt OCR (founder D1, 12 Oct 2026)

**Engine.** Self-hosted **PaddleOCR** (Apache-2.0), plus the e-invoice QR read (§13.4). Receipts never leave our servers.

**Seam.** `interface ReceiptReader { read(file: Buffer, mime: string, hints: { country: string; currency: string }): Promise<OcrResult> }`, chosen by `EXPENSE_OCR_ADAPTER`:
- **`paddle-worker`**: the production adapter (below);
- **`dev-fake`**: deterministic results for tests;
- **`none`**: manual entry, with the QR still read.

A cloud provider can be added later, per customer, as another adapter.

**The isolated worker.**
- A separate container image (Python, PaddleOCR and its pinned models baked in at build time), run with:
  - **no network** at inference (`network: none`; the API passes the file over a local socket or a mounted spool directory);
  - a non-root user and a read-only root filesystem;
  - CPU, memory and wall-clock limits (starter: 1 CPU, 1.5 GB, 20 s per page, 3 pages per file).
- **Input check before the worker:** only JPG, PNG, HEIC (converted to PNG) and PDF, sniffed from the bytes. Size up to 10 MB and dimensions up to 6,000 px a side. PDFs are rasterised by the API side, at most 3 pages, with no scripts or embedded files. The virus scan has to pass first.
- **Output:** JSON only, parsed strictly against a schema: unknown keys refused, strings length-capped, amounts as decimal strings, dates as ISO. Anything else is a failed read, and the employee types the values. The worker never writes to the database.
- **Queue:** a BullMQ queue with a small concurrency (per-company fairness), and a retry once on a crash.

**What it fills.** Amount, date, vendor, GSTIN, invoice number and the tax lines (taxable value, CGST, SGST, IGST), as **suggestions**:
- the parser is ours (`ocr-parse.ts`, pure, unit-tested): it turns PaddleOCR's text boxes into fields with Indian receipt patterns (₹ amounts, dd/mm/yyyy dates, GSTIN shape and check digit);
- each field carries a **confidence** (0–1) from the recognition score and the pattern match.

**What the employee sees.** Every suggested field is shown with its confidence; fields below the company threshold (starter 0.8) are highlighted "Please check". The employee confirms or edits each one. **Nothing is submitted or approved by OCR** (Q4). Edits are kept (`ocr` JSON on the line: suggested value, confidence, final value), and a big gap between OCR and the final amount is flag F10.

**Downloads.** PaddleOCR packages, models and base images are pulled only after the founder approves the exact list: names, versions, sizes, official source and licence. Until then everything is built and tested against the `dev-fake` adapter.

**Other options considered** (kept for a per-customer adapter later):

| Option | Kind | Good | Watch out |
|---|---|---|---|
| Tesseract (Apache-2.0) | Open source | Small, offline | Text only, weak on phone photos |
| docTR (Apache-2.0) | Open source | Good recognition | Heavier; same parsing work |
| Cloud receipt models (AWS Textract expense analysis, Google Document AI expense parser, Azure AI Document Intelligence receipts) | Provider | Fields pre-extracted | Per-page cost; data leaves our servers; DPDP agreement |
| Specialist receipt APIs (for example Mindee, Veryfi) | Provider | Tuned for receipts | Cost; data leaves our servers |

---

## 15. Fraud and duplicate checks

All checks are pure functions in `checks.ts` (unit-tested); the service loads the candidates.

| # | Check | Outcome |
|---|---|---|
| F1 | **Exact same receipt file:** identical SHA-256 anywhere in the company | **Blocked** (YX-EXP-04) |
| F2 | **Same GST invoice:** same supplier GSTIN + invoice number anywhere in the company | Blocked when both are in a submitted claim; flagged across employees otherwise |
| F3 | **Look-alike claim:** same employee, same amount, same date, merchant names alike | Flag |
| F4 | **Re-photographed receipt:** a perceptual image hash close to another receipt's | Flag (E5; §22 D6) |
| F5 | **Splitting:** several lines of one category, same day or merchant, each under the line limit and together over it | Flag |
| F6 | **Just under the limit or receipt threshold,** repeatedly (3+ in 90 days) | Flag |
| F7 | **Dates:** in the future (blocked); before joining or after the last day (blocked); outside the trip for trip lines; on a full-day leave day for local conveyance or meals (from M02); older than the claim window | Flag, or blocked as stated |
| F8 | **Overlaps:** per diem on days with company-paid lodging and meals, or two per-diem lines for the same day | Per diem reduced by the meals rule; overlap blocked |
| F9 | **Mileage:** more km than the M02 field-day distance (B2); more than the monthly cap | Flag; cap enforced |
| F10 | **OCR vs typed:** amount differs by more than ₹1 or 1 %, or the date differs | Flag |
| F11 | **GST:** bad GSTIN check digit, tax maths wrong, invalid e-invoice QR signature | Flag (the QR one is high risk) |
| F12 | **FX:** manual rate outside the tolerance | Flag (B18) |
| F13 | **Approver patterns:** one approver approving many over-limit or flagged claims of the same person | Report for finance (EXP-09), not a block |

- **Risk:** `none` / `low` / `high` from the open flags (high = F2, F11-QR, or 3+ flags). High-risk claims always get the finance step.
- **The duplicate key** (`dup_key`) is a hash of employee, date, amount and normalised merchant. It is indexed for F3 and kept on the line, so lookups stay cheap.
- **What the approver sees:** flags in plain words ("This receipt looks the same as one on claim CL-0142 (Ravi, 3 Oct)"), never a raw score. Cross-employee duplicates show only the claim reference to people outside that claim's scope.

---

## 16. Permissions

### 16.1 New keys (P02, scoped like employee records)

| Key | Who | Gives |
|---|---|---|
| `expense.claim.view` | HR, department heads | Claims, trips and advances of people in scope (read) |
| `expense.finance.review` | Finance | The finance audit queue; clear or confirm flags; set a claim's route |
| `expense.payout.manage` | Finance | Payout batches, payment results, advance payments and returns; journals |
| `expense.payout.release` | Finance lead | Release a payout batch (second sign-in step; maker ≠ checker) |
| `expense.policy.manage` | Finance, HR | Categories, tiers, policies, rates, GST registrations, FX tables |
| `expense.report.view` | Finance | Expense reports, including GST input |
| `travel.booking.manage` | Travel desk | Add bookings to trips they are asked to book |
| `expense.card.manage` | Finance | Card accounts, statement imports, matching (E6) |

**Implicit grants (no key):**
- my own claims, trips, advances and payments;
- tasks I hold in P03 and the claim behind them;
- categories and my own limits.

Every M05 endpoint is added to `endpoint-permissions.spec.ts`.

### 16.2 Role templates
- **Finance Approver** gains `expense.finance.review`, `expense.report.view` and `expense.payout.manage`.
- **HR Admin** gains `expense.claim.view`.
- `expense.policy.manage` is company configuration, granted company-wide only, so it does not fit the entity-scoped HR Admin or Finance templates. A new company-wide **Expense set-up** template holds it (built in E1); System Admins have it too.
- A new **Travel Desk** template has `travel.booking.manage`.
- `expense.payout.release` is in no template by default. The company grants it to a named person.

### 16.3 MFA
`expense.payout.manage`, `expense.payout.release` and `expense.policy.manage` are sensitive (they need a second factor, like payroll keys).

---

## 17. Events, notifications, jobs

### 17.1 Events (APX-B §2.13, thin payloads, same transaction)
Emitted:
- `expense.claim.submitted`, `.approved`, `.rejected`, `.flagged`, `.paid`;
- `trip.approved`, `trip.booking.uploaded`;
- `advance.paid`, `advance.overdue`, `advance.recovery.scheduled`, `advance.settled`;
- `card.statement.imported` (E6).

Consumed: §11.4.

### 17.2 Notifications (APX-A PAY group; amounts only in-app, P04 Q6)
- **Approver:** claim waiting; reminder.
- **Employee:**
  - approved, partly approved with the reason, rejected, sent back;
  - paid, payment failed;
  - advance paid, settlement due, overdue, recovery scheduled;
  - trip approved, bookings added.
- **Finance:** flagged claim; payout batch waiting for release; unmapped journal lines.
- **Travel desk:** booking requested.

### 17.3 Jobs (`expenses-jobs.ts`, BullMQ like lifecycle)
- **Daily:**
  - FX import;
  - advance settlement reminders (SCH-43): due, then overdue, then recovery creation;
  - claim-window reminders for drafts older than 30 days;
  - the GST time-limit flag.
- **Hourly:** claims approved before the cut-off are queued into payroll; the receipt virus-scan retry is shared with `FilesService`.

---

## 18. API

All routes are under `/api/v1/expenses`. Writes take `version` for optimistic locking. Uploads are throttled like 6a uploads.

| Area | Endpoints |
|---|---|
| Setup | `GET /setup-check` · `GET,POST,PUT /categories` · `POST /categories/from-starter` · `GET,POST,PUT /tiers` · `GET,POST,PUT /policies` (rules inline) · `GET,POST /mileage-rates` · `GET,POST /per-diem-rates` · `GET,POST /fx-rates` · `GET,POST,PUT /gst-registrations` |
| Me | `GET /me/limits?on=` · `GET /me/home` (claims, waiting, "you will receive") |
| Claims | `GET /claims?mine\|team\|scope` · `POST /claims` · `GET /claims/:id` · `PUT /claims/:id` (title, trip) · `POST /claims/:id/lines` (multipart receipt) · `PUT /claims/:id/lines/:lineId` · `DELETE /claims/:id/lines/:lineId` (drafts only, soft) · `POST /claims/:id/check` (dry run) · `POST /claims/:id/submit` · `POST /claims/:id/withdraw` · `PATCH /claims/:id/lines/:lineId/approve-amount` · `GET /claims/:id/lines/:lineId/receipt` (streamed after the scope check) |
| Finance | `GET /review` · `POST /flags/:id/clear\|confirm` · `PUT /claims/:id/route` |
| Payment | `GET /to-pay` · `POST /payout-batches` · `POST /payout-batches/:id/release` (step-up) · `POST /payout-batches/:id/results` · `GET /payments?claim=` |
| Trips | `GET,POST /trips` · `GET,PUT /trips/:id` · `POST /trips/:id/submit` · `POST /trips/:id/bookings` (multipart) · `GET /trips/:id/settlement` |
| Advances | `GET,POST /advances` · `GET /advances/:id` (with its settlement ledger) · `POST /advances/:id/pay` · `POST /advances/:id/return` · `POST /advances/:id/recover` |
| Journal | `GET /journals?entity=&month=` · `POST /journals/:id/export` · `POST /journals/:id/posted` |
| Reports | `GET /reports/summary\|unpaid\|advance-ageing\|over-limit\|gst-input` (CSV export) |
| Cards (E6) | `POST /cards/statements` · `GET /cards/transactions` · `POST /cards/transactions/:id/match\|explain\|personal` |

---

## 19. Screens

### 19.1 Wired from the prototype (`screens/ops/expenses*.tsx`)

| Screen | Batch | Gaps to fix while wiring |
|---|---|---|
| EXP-07 Policy matrix | E1 | Add dated versions and the "applies to" picker (P19 group). The persona switch becomes permission-driven |
| EXP-01 Expenses home | E2 | The setup-check card for finance and HR; drafts older than the window |
| EXP-02 Claim composer | E2 | Mileage and per-diem cards compute the amount (not typed); the self-declaration below the receipt threshold; flags in plain words |
| EXP-03 Claim review | E2 | Reduce-with-reason calls the approve-amount endpoint; the receipt viewer streams through the API; flags section with clear / confirm for finance |
| EXP-06 To pay | E3 | Route per claim; payout batch with release by another person |
| EXP-04 Trip | E4 | Legs with tier per leg; bookings upload; settlement view |
| EXP-05 Advance | E4 | Settlement ledger; forex view (E5) |
| EXP-09 Reports | E5 | GST input tab; approver pattern report |
| EXP-08 Card import | E6 | Wired when the card seam gets an adapter |

### 19.2 Rules every screen follows (standing YukthiX rules)
- Every control looks clickable.
- A single choice uses the Segment control.
- Errors show after Save, never while typing.
- The net amount is the first figure (YX-EXP-06).
- Status and payment status are two separate badges.
- Mobile-first for the composer, the trip and the advance (D+M in APX-D).

---

## 20. Security

- **Receipts:**
  - Confidential (P02);
  - stored encrypted, scanned before anyone can open them, streamed through the API after the scope check;
  - never a public link; EXIF location stripped on store.
- **GSTIN and bank data:** bank details come from the employee's verified bank accounts (cooling period after a change, as for salary). M05 never stores account numbers.
- **Maker ≠ checker:**
  - the requester never approves their own claim;
  - the payout generator never releases it;
  - the finance clearer of a flag is not the claim's requester.
- **Step-up:** payout release, policy changes that raise limits by more than 50 %, and FX table edits.
- **Audit:** every status change, approve-amount change, flag decision, route change and payout action.
- **Rate limits:** uploads per user per minute, and OCR calls per company (credits).
- **Tests:**
  - the RLS isolation suite covers every new table;
  - an endpoint-permissions entry for every route;
  - support-session exclusion on claims, receipts and advances.

---

## 21. Build order (PR-sized slices)

Slice IDs are `XP-n.nn`, so they don't clash with the APX-D screen IDs EXP-01 … 09. Each slice ships with its tests and passes the standing checks: typecheck, API unit, web and screen tests, the batch's API e2e against the real database with forced RLS, a fresh-database migrate and `migrate status`, and Playwright for the screens it touches.

### 21.1 Batch E1 · Setup and policies (6 slices)

| ID | Slice | Tests |
|---|---|---|
| XP-1.01 | Migration E1 (§5.2), RLS, permissions keys, role templates, settings keys | RLS isolation; endpoint permissions; fresh-DB migrate |
| XP-1.02 | Categories and tiers with starters, translations subject types (G1) | e2e: copy starter, edit, translated name in Hindi |
| XP-1.03 | Policies and rules with P19 `applies_if`, dated, most-specific pick | unit: pick by specificity and date; e2e: grade-band policy applies on the expense date |
| XP-1.04 | Mileage and per-diem rates; limit maths in `checks.ts` | unit: per line / day / trip / month, mileage cap, per diem partial days and meals deduction |
| XP-1.05 | GST registrations per entity and state; GSTIN check digit | unit: valid and invalid GSTINs, state codes |
| XP-1.06 | Setup check and the EXP-07 policy matrix screen wired | screen tests; Playwright: finance sets a Tier 2 hotel cap |

### 21.2 Batch E2 · Claims, approvals, checks and OCR (10 slices)

| ID | Slice | Tests |
|---|---|---|
| XP-2.01 | Migration E2, claims and lines CRUD, receipt upload through `FilesService` | e2e: line with receipt; virus-scan pending blocks submit; receipt streamed only in scope |
| XP-2.02 | Policy check on lines (stored result), self-declaration below threshold | e2e: ₹1,00,000 taxi with no receipt is blocked (EX-D4) |
| XP-2.03 | Mileage and per-diem lines computed, not typed | e2e: a typed amount on a mileage line is refused |
| XP-2.04 | Duplicate and fraud checks F1–F3, F5–F8, F10, F11 (not QR) | unit per check; e2e: same receipt by two employees blocked on the second (YX-EXP-04) |
| XP-2.05 | P03 registration: chain, cost-centre step, excess step, finance audit step, distinct steps | e2e: an over-limit line adds the excess step; a client approver is ignored (EX-D3) |
| XP-2.06 | Approve with changes, send back, partly approved | e2e: "Approved ₹1,200 of ₹2,000 — hotel cap Tier 2" (U61, U68); no reason → 400 |
| XP-2.07 | GST capture (company option), ITC status, blocked-credit list from P07 | e2e: two lines at different GST rates keep their own tax (EX-D5); hotel in another state → wrong state |
| XP-2.08 | OCR seam (`none`, `dev-fake`), the strict output parser and field confidence, e-invoice QR read with signature check | unit: parser on sample OCR text, schema refusal of bad output, QR signature with a test key pair; e2e: the dev fake pre-fills with confidence, never submits |
| XP-2.10 | `paddle-worker` adapter: isolated container (no network, non-root, limits), queue, input checks (after the founder approves the downloads) | contract tests with sample receipts; e2e: oversize or wrong-type file refused before the worker; a worker timeout leaves manual entry |
| XP-2.09 | Screens EXP-01, 02, 03 wired | screen tests; Playwright: snap, check, submit, manager reduces with reason |

### 21.3 Batch E3 · Payment, payroll and ledger (8 slices; needs §4 changes 1–4)

| ID | Slice | Tests |
|---|---|---|
| XP-3.01 | M03: `exp_reimb` / `exp_taxable` starters; calc keeps `reimbursement` out of gross and wages | payroll golden tests unchanged; unit: reimbursement in net, not in PF wage |
| XP-3.02 | M03: payroll outbox events (`payroll.run.paid`, `.voided`, `payment.failed`, `recovery.deferred`) | payroll e2e: each event once per transition |
| XP-3.03 | Route choice and next-payroll hand-off (one-time pay, cut-off, advance adjusted) | e2e: approved before the cut-off appears as one-time pay; after it goes to next month |
| XP-3.04 | Paid / voided / failed transitions, idempotent | e2e: "Approved — payment in October payroll" (U62) → paid on run paid; the same event twice changes nothing |
| XP-3.05 | Taxable portions and the taxable-already-paid tax input (M03) | e2e: a taxable line paid by payout raises TDS in the next run |
| XP-3.06 | Direct payout batches: bank file, release by another person with step-up, results | e2e: same person cannot release; failed row → payment failed |
| XP-3.07 | Expense journal via `ledger_mappings`, unmapped blocks export | unit: accrual, GST input, payout, clearing; e2e: unmapped category blocks export |
| XP-3.08 | Screen EXP-06 wired; locked paid claims and adjustment claims | Playwright: finance pays by payout; a paid line cannot be edited (YX-EXP-12) |

### 21.4 Batch E4 · Trips and advances (7 slices)

| ID | Slice | Tests |
|---|---|---|
| XP-4.01 | Migration E4, trips and legs, P03 `expense.trip` | e2e: trip request for any employee; approval creates the advance (YX-EXP-08) |
| XP-4.02 | Bookings by upload (employee, admin, travel desk); company-paid bookings count, not reimbursed | e2e: a company-paid ticket counts against the budget, not the payout |
| XP-4.03 | Travel booking partner seam (`TravelBookingAdapter`, dev fake only) | unit: adapter contract with the fake |
| XP-4.04 | Advances (trip, imprest), payment, settlement by claims, net payable | e2e: ₹10,000 advance, ₹7,000 claimed → ₹3,000 to return (M05 §9) |
| XP-4.05 | Reminders, overdue, recovery through the loan engine (`loan_type = 'expense'`), bank return | e2e: overdue advance → loan row; deferral keeps the balance |
| XP-4.06 | Exit: open advances to F&F | e2e: open balance appears in the F&F inputs (U65) |
| XP-4.07 | Screens EXP-04, 05 wired | Playwright: trip with an advance, claim against it, settlement |

### 21.5 Batch E5 · Multi-currency, field-force mileage, reports (6 slices)

| ID | Slice | Tests |
|---|---|---|
| XP-5.01 | FX rates import (FBIL / ECB / company table), holiday fallback, staleness note | unit: rate on a holiday = last published; e2e: import is idempotent |
| XP-5.02 | Foreign-currency lines, tolerance flag, proof upload | e2e: Neha's AED 1,200 Dubai bill converts at the 12 Nov reference rate; her card rate 4 % higher is flagged (YX-EXP-14) |
| XP-5.03 | Forex advances and the exchange-difference line | e2e: USD 500 advance, USD 420 spent, USD 80 returned on 30 Nov at that day's rate with a separate difference line (YX-EXP-15) |
| XP-5.04 | Field-force distance as draft mileage lines (M02 §B8), one per duty day | e2e: Vikram's 42 km day appears as a draft and is paid only after he confirms (YX-EXP-16) |
| XP-5.05 | Look-alike image hash (F4) and approver-pattern report (F13) | unit: near-duplicate photos match, different receipts do not |
| XP-5.06 | Reports EXP-09 including GST input CSV | e2e: report totals equal the claims; Playwright: GST tab export |

### 21.6 Batch E6 · Seams waiting for a provider (2 slices)

| ID | Slice | Tests |
|---|---|---|
| XP-6.02 | Corporate cards: statement import adapter (CSV first), matching, explain, personal spend recovery; EXP-08 wired | e2e: an unmatched line asks the employee; personal spend becomes a recovery |
| XP-6.03 | Travel partner adapter for the chosen partner | contract tests with the partner sandbox |

**Totals:** E1 6 · E2 10 · E3 8 · E4 7 · E5 6 · E6 2 = **39 slices**.

---

## 22. Decisions for the founder

**Accepted 12 Oct 2026.** D2–D9 with the recommended defaults (bold). **D1 changed:** receipt OCR at launch with self-hosted PaddleOCR in an isolated worker plus the e-invoice QR read; receipts never leave our servers; the adapter seam stays for per-customer cloud providers; the OCR slice moves into E2 (§14.6, XP-2.08 and XP-2.10); downloads only after the founder approves the exact list.

### 22.1 For the payroll builder (before E3)
These are the five M03 changes from §4, to be made by the payroll builder, not in the expenses branch:
1. Starter components `exp_reimb` (kind `reimbursement`, not taxable, no wage flags) and `exp_taxable` (earning, taxable, no wage flags).
2. The calculation keeps kind `reimbursement` on the payslip under "Reimbursements": outside gross pay and every wage base, inside net pay (D3).
3. A tax-projection input for taxable expense amounts already paid outside payroll (like `perquisites`).
4. Outbox events `payroll.run.paid`, `payroll.run.voided`, `payment.failed` and `recovery.deferred`, once per transition, with ids only (D5).
5. A forward migration adding `expense` to `loans_type_check`; recovery as an interest-free, non-perquisite loan (D4).

### 22.2 Receipt OCR worker: what was downloaded (approved 12 Oct 2026, option A)

The founder approved the download list and then option A for OpenCV's system libraries (the full OpenCV build with libGL; no display is ever used). Everything comes from the official sources below and is pinned. The lock files are in git (`apps/ocr-worker/`); wheels, packages and model files are not. Built and tested 12 Oct 2026 (contract test on synthetic receipts: a hotel bill, the same bill tilted, a PDF bill, a bill with a QR code, and a broken file).

| What | Pin | Official source | Licence |
|---|---|---|---|
| Base image `python:3.12-slim-bookworm` | `sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d` | Docker Hub official image | PSF, Debian |
| Python packages for the worker (70, incl. paddleocr 3.7.0, paddlex 3.7.0, paddlepaddle 3.3.1 CPU, opencv-contrib-python 4.10.0.84) | `requirements.lock`, every file by version and SHA-256 (`pip --require-hashes`); lock SHA-256 `1ddd17f3fd9b60f37f3984fae419f206dabef760fd927a03f93886372ac4280b` | PyPI (`files.pythonhosted.org`) | Apache-2.0, MIT, BSD in the main; crc32c LGPL-2.1+; certifi, tqdm MPL-2.0; OpenCV wheel bundles FFmpeg (LGPL-2.1) and Qt (LGPL-3) |
| Python packages for the model-fetch build stage (15, huggingface_hub 2.2.0) | `models.lock`, SHA-256 `2863f261b93fe3a78d9af8bf841b493ac87ba40118bee2775b31cfc8a75a9c87` | PyPI | Apache-2.0, MIT, BSD |
| Debian packages (43: libgl1, libglib2.0-0, libgomp1 and their dependencies incl. Mesa 22.3.6, LLVM 15, libz3, libicu72, libxml2, X11/xcb) | `debian.lock` exact versions, SHA-256 `c4d30e50911ad0bc73b9e4e3685bfc080208c74b4dafb78f9f5f1968ec2da10f`; archive at `snapshot.debian.org` timestamp `20261012T000000Z` (bookworm, bookworm-security), signed by the Debian archive keyring | `https://snapshot.debian.org/archive/debian/` and `.../debian-security/` | MIT/X11, Apache-2.0 with LLVM exception, ICU, LGPL-2.1+ (glib), GPL-3 with GCC runtime exception (libgomp) |
| Model `PaddlePaddle/PP-OCRv5_mobile_det` | commit `0d63e78e2b680928f6b1747d76a08db6e645efb7`; `inference.pdiparams` SHA-256 `afa1820cb16c1fd0dad589d0f8b389139061c1ef6d68019685fd07be997dda5b` | `https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det` | Apache-2.0 |
| Model `PaddlePaddle/en_PP-OCRv5_mobile_rec` | commit `267c36e24c331595590fe7bd72bde2436fd286f2`; `inference.pdiparams` SHA-256 `3ec8a97ed6cefe8568d3e2ee90bb193299b566a7661aa4fd52d224b96b59f66b` | `https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec` | Apache-2.0 |
| Model `PaddlePaddle/PP-LCNet_x1_0_textline_ori` | commit `cd237a44b0e359d4fe38310a416203cf7403faa5`; `inference.pdiparams` SHA-256 `0de2bcf996cf553e2b848dd7b1769dafffc6917b1ccdf55c1d8efe7909fbf743` | `https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori` | Apache-2.0 |

- **Build check:** the build verifies each model file against its SHA-256 and installs only hashed Python packages.
- **No run-time fetching:** the models are baked into the image and paddlex's model-source check is off. The container runs with no network, so nothing can be fetched.
- **Run:** network none, user 10001, read-only root filesystem, a 256 MB `/tmp` scratch mount, 1 CPU, 1.5 GB memory, 64 processes, all capabilities dropped, no new privileges.
- **Notices:** `/licenses/THIRD-PARTY-LICENSES.txt` in the image holds every Python distribution's licence files (incl. OpenCV's FFmpeg and Qt notices), every Debian package's copyright file and the model sources.
- **Image:** about 2.3 GB unpacked; the worker uses about 370 MB of memory when idle.
- **Paddle setting:** on CPU, Paddle 3.3's oneDNN path cannot run these models (an unimplemented attribute), so the worker turns oneDNN off (`enable_mkldnn=False`). This is a setting, not another download.
- **Upgrading:** a new version of anything above means a new approval, new pins and a new contract-test run.

Questions, with the recommended default in bold.

### D1 · Receipt OCR at launch
M05 Q4 said "OCR at launch on every receipt", but no provider is chosen and we build no paid one without your choice.
- A: **Launch with manual entry plus the free e-invoice QR read; OCR seam ready; choose a provider before E6.**
- B: Self-host an open-source OCR (PaddleOCR or Tesseract) in our region now. Free per page, but we run and patch a model service and write our own field parsing.
- C: A cloud receipt model (AWS, Google or Azure, India region) as a paid add-on. Best quality, per-page cost, a DPDP data-processing agreement.

### D2 · Starter FX source
M05 named the "RBI reference rate"; FBIL has published the INR reference rates since 2018.
- A: **FBIL reference rates for the currencies it covers, ECB euro rates for cross rates, company table as the alternative; switched on after a check of each source's reuse terms.**
- B: Company monthly table only (no automatic import).
- C: A paid FX feed (third-party add-on).

**Changed 12 Oct 2026 (founder):** the pilot uses **B, the company rate table**. Before the global launch a **paid, licensed FX feed whose terms allow use for payments** is chosen and added as a feed next to the table. **ECB and FBIL stay off:** ECB says its reference rates are for information only and discourages transaction use; FBIL's reuse terms could not be confirmed. Built in E5 this way (§14.2, go-live item 21).

### D3 · Reimbursements on the payslip
- A: **A separate "Reimbursements" section, outside gross pay and wage bases, inside net pay (needs a small payroll change).**
- B: Show them as an ordinary earning (no payroll change, but gross pay looks inflated and confuses PF / ESI checks).

### D4 · How advances are recovered from salary
- A: **Through the payroll loan engine as an "expense" loan (protected net, deferral and F&F already work).**
- B: A separate recovery table in M05 feeding one-time deductions (more code, a second recovery path).

### D5 · How expenses learn that payroll paid
- A: **Payroll emits the outbox events APX-B already lists (`payroll.run.paid` and the others); expenses listens.**
- B: Expenses checks payroll tables on a timer (no payroll change, slower and more coupling).

### D6 · Look-alike receipt photos
- A: **Flag near-duplicate photos (perceptual hash) from E5; exact copies are blocked from E2.**
- B: Exact copies only.

### D7 · GST registrations per state
Each legal entity has one GSTIN today; hotel credit needs the registration in the hotel's state.
- A: **Add per-state GST registrations owned by expenses now (other modules can read them later).**
- B: Put them in the core entity record (G1 / P01 owner).

### D8 · Old receipts
- A: **Lines older than 60 days need the finance step; older than the GST time limit are flagged for lost credit; nothing is auto-blocked.**
- B: Block lines older than 90 days.

### D9 · Who can release a direct payout
- A: **Only a named person given `expense.payout.release`, never the one who made the batch, with a second sign-in step.**
- B: Anyone with `expense.payout.manage`, other than the maker.

---

## 23. India law points (public sources, in our own words)

- **GST input credit** (CGST Act, 2017): credit needs a tax invoice naming the buyer's GSTIN, the supply received, and the tax paid by the supplier and reported; a yearly time limit applies; some kinds of spend are blocked whatever the invoice says. §13.
- **Place of supply** (IGST Act, 2017): same state means CGST + SGST; different states means IGST. For lodging, the hotel's location decides. §13.2.
- **E-invoicing:** large suppliers register B2B invoices on the invoice registration portal, which returns an IRN and a signed QR code. §13.4.
- **Records:** GST records are kept for 72 months from the annual-return due date. §13.6.
- **Income tax:** reimbursement of actual business expenses with bills is not the employee's income; fixed allowances and personal spend paid by the employer generally are. The treatment of tour and travel allowances differs between the old and new tax regimes. All of it is P07 rule data with the `verify` flag, and the compliance owner signs off before go-live. §11.2.
- **Wages:** deductions from wages for advances are allowed within the limits the payment-of-wages rules and the Code on Wages set. M03 applies the protected net and the legal cap (§8.4); M05 never deducts by itself. §11.3.
- **FX:** the INR reference rates are published by FBIL. Accounting standards record foreign-currency transactions at the date's spot rate or a period average. §14.2.
- **Personal data** (DPDP Act, 2023): receipts can show where a person was. They are Confidential, kept only as long as the retention rule says, and sent to an external OCR only under a data-processing agreement. §14.6, §20.

---

## 24. Change log

| Date | Change |
|---|---|
| 12 Oct 2026 | Batches E4 (trips, bookings, advances) and E5 built. D2 changed by the founder: company rate table for the pilot; a paid, licensed FX feed allowing payment use before the global launch; ECB and FBIL off. |
| 12 Oct 2026 | Batch E2 built; the receipt OCR worker built from the approved downloads (option A: full OpenCV with libGL and its Debian dependencies), pins and sources in §22.2, go-live item 20. |
| 12 Oct 2026 | Batch E1 built: `fx_rates` moved to E5 (§5.7); one starter policy instead of three grade bands (§6.2); `expense.policy.manage` in a new company-wide Expense set-up template instead of HR Admin and Finance (§16.2). |
| 12 Oct 2026 | Founder accepted D2–D9; D1 changed to self-hosted PaddleOCR at launch in an isolated worker (no network, non-root, limits, strict output parse, per-field confidence, nothing auto-submits); OCR slice moved to E2 (XP-2.10); §22.1 lists the five payroll changes for the payroll builder. |
| 12 Oct 2026 | First draft: scope, reuse, data model by batch with RLS, settings and starters, policies as P19 rule data, claims, P03 approvals with approve-with-changes, payment routes, payroll hand-off (reimbursement section, taxable portions, recovery through the loan engine, payroll events), ledger hand-off through GP-PAY-1 mapping, India GST input credit, FX (FBIL correction), OCR seam with options, fraud and duplicate checks F1–F13, permissions, events, API, screens, security, 39 slices in batches E1–E6, founder decisions D1–D9. |
