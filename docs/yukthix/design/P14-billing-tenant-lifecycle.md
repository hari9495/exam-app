# P14 · Billing, Tenant Lifecycle & Platform Console

> **Status:** ✅ Decided (8/8), 26 Sep 2026. **Extended 26 Sep 2026 (gap register, user decision):** customer-success tooling (GAP C8: health score, in-app messages to tenant admins, churn-risk alerts; §3, YX-CONSOLE-05/06, flow 6) and new partner add-ons in the catalogue (earned wage access B10, compensation benchmarking C3, learning content C2, Aadhaar eKYC / DigiLocker C6; job-board posting costs stay the customer's, B8; YX-BILL-11); §11 C8 / add-ons. **Market analysis additions (G1–G5, 26 Sep 2026):** billing from go-live, price / feature-change notice, published price list, exit document packs, status page and maintenance windows (YX-BILL-12–14, YX-TEN-07, YX-CONSOLE-07; §11 G1–G5). **Validation pass 3 Musts (founder decisions 28 Sep 2026):** **J15b** one billable unit per person per product per month across all legal entities, with the cost split by entity on the invoice (YX-BILL-02 / 03 / 10 and Q1 amended); **S12** export invoices zero-rated under a GST LUT with FIRC / e-BRC reconciliation (YX-BILL-16 / 17); **S1** product-analytics access for YukthiX staff only (YX-CONSOLE-08; metrics in P09 §4.10); **S11** incident and maintenance message templates (YX-CONSOLE-07 amended; templates in [P20](P20-growth-trial-customer-operations.md)); §11 J15b / S12 / S1 / S11. The quick start, trial-to-paid journey and help centre are designed in P20. Validation pass 3 Shoulds added 28 Sep 2026 (§8b).
> **Covers:**
> - spec §2.1.17 (Billing & Subscription: plans, seats, metered AI, invoices, dunning) and spec **D15** (one plan per product + paid add-ons);
> - GAP-REGISTER **A4** (billing engine, trial, tenant offboarding, whole-tenant export, platform console, support tiers) and C8 (customer-success signals);
> - NFR review rows 29–35, 39–44.
>
> **Builds on:**
> - P01 tenants and legal entities;
> - P02 staff and external logins (not billed, YX-SEC-21);
> - P04 SMS quota (Q3);
> - P10 AI credits and partner add-ons;
> - P11 API limits (Q8);
> - P12 staff access and crypto-shredding (YX-SECOPS-02);
> - M01 pre-boarders are not billed (YX-LC-12);
> - M10 recruiting costs;
> - T02 cost per test;
> - APX-G terms / order form / SLA (G-01, G-02, G-14).
>
> **Build wave:** billing core and tenant lifecycle before the wave-3 paid pilot. Self-serve sign-up and trial before public launch.

---

## 1. Purpose & scope
Customers should be able to:
- buy one or more YukthiX products, with add-ons;
- pay in the way Indian businesses pay;
- get correct GST invoices;
- understand what they are charged for;
- leave cleanly with their data.

YukthiX staff get one console to run tenants, billing, statutory publishing and support safely.

## 2. What exists today (exam app, `origin/main`)

| Capability | Today | P14 |
|---|---|---|
| Plans | `Plan` model with Stripe product / price ids; org `planId` | **Change**: products × single plan (D15) + add-on catalogue |
| Subscription & payment | Stripe checkout + webhook; org `stripeCustomerId` / `stripeSubscriptionId` | **Change**: Indian gateway primary (Q3), Stripe kept for international |
| Quotas | `quota.service` with quota-exceeded exception | **Extend** into the entitlement + fair-use engine |
| Usage metering | `AiCreditUsage`; P04 SMS meter; P11 `api_usage_daily` | **Unify** into one meter ledger |
| Invoices, GST, dunning, trial, offboarding, console | Missing | **Add** |

## 3. Concepts
- **Product subscription:** tenant × product (HRMS / ATS / Proctoring) on that product's single plan. Analytics is included in each. Billing period is monthly or annual (Q3).
- **Billable unit** (Q1, Q2):

  | Product | Billed per |
  |---|---|
  | HRMS | Billable employee, plus each consultant paid in the month (A8, YX-BILL-10); **one unit per person per month across all the tenant's legal entities** (J15b, YX-BILL-02) |
  | ATS | Recruiter seat |
  | Proctoring | Test attempt |

- **Not billed:**
  - pre-boarders;
  - alumni and nominees;
  - the external logins (trainer, IC member, client contact, audit chair, candidate);
  - hiring managers and panel members in ATS.
- **Add-on:** only (a) partner services with a per-use cost and (b) usage above fair use (D15). Priced per unit, pass-through or bundled (team pricing decision). Examples:
  - payout API, PAN / bank verification;
  - TDS / PF partner filing, BGV, Aadhaar eSign;
  - GST e-invoicing, travel booking;
  - YukthiX proctors, licensed question packs;
  - SMS overage, AI credits, extra storage, higher API limits;
  - **added 26 Sep 2026 (gap register):**
    - **earned wage access (EWA, B10):** partner-funded advances against earned salary, recovered in payroll (M03); YukthiX passes through the partner's per-transaction or per-user fee; YukthiX never lends or holds the funds;
    - **compensation benchmarking data (C3):** licensed market-pay datasets used in comp review and offers (M06 / M10), priced per dataset or per seat by the data partner;
    - **learning content connectors (C2):** LinkedIn Learning / Coursera / content-marketplace licences (M07); the connector is included, the content licence is the partner's charge (or the customer's own contract);
    - **Aadhaar eKYC / DigiLocker (C6):** per-verification fee of the licensed KYC partner (onboarding, M01 / P10);
    - **job-board postings (B8):** Naukri / Shine / LinkedIn and other paid postings are **the customer's own cost on the customer's own board account**; the connector is included, YukthiX does not resell postings (YX-BILL-11).
- **Bundle discount:** applied automatically when a tenant has 2+ products.
- **Entitlements:** the features, limits and add-ons a tenant may use right now. Enforced by the platform (feature flags + quotas), shown in *Billing & Account*.
- **Meter ledger:** append-only usage events per tenant × meter × day. The source for invoices, usage pages and fair-use alerts.
- **Tenant lifecycle:** trial → active → past due → restricted → suspended → cancelled (grace) → deleted (Q4–Q6).
- **Partner billing (P16, added 26 Sep 2026):** for a client linked to a partner, the partner chooses the billing mode **per client** (P16 Q3, YX-PTR-11):
  - **direct + referral commission:** YukthiX invoices the client at the published D18 price; the partner earns a monthly referral commission (% of that client's subscription, excluding add-on pass-through costs and taxes), each commission line linked to the client invoice it came from;
  - **consolidated partner invoice:** one GST invoice to the partner for all its partner-billed clients at a **partner discount**; the partner re-bills its clients with its own service fee. The client's YukthiX price is never above the published price; if the partner doesn't pay, the client may switch to direct billing and is not suspended for the partner's debt.

  Commission and discount rates are set in the partner programme and must pass YX-BILL-09. An **ownership transfer** (P16 YX-PTR-13) moves the billing account with ownership. Partner tables (`partner_billing_accounts`, `partner_commissions`, `ownership_transfers`) are platform tables defined in P16 §4.
- **Platform console:** the YukthiX staff application:
  - tenants and lifecycle actions;
  - plans, prices and add-ons;
  - invoices and payments;
  - statutory rule publishing (P07);
  - support sessions (P02);
  - incident / vulnerability registers (P12);
  - tenant health and **customer success** (C8): health score per tenant, in-app messages / announcements to tenant admins, churn-risk alerts to the YukthiX CS team;
  - **partners (P16):** partner applications and verification, partner list and hierarchy, commission approval and payouts, consolidated partner invoices, partner-directory moderation.

  Staff roles are least-privilege with hardware-key MFA (P12 Q7).

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `products`, `plans`, `plan_prices` | Product catalogue; one plan per product; prices per currency, period, region (dated) |
| `addons`, `addon_prices` | Add-on catalogue: type (partner pass-through / usage / custom connection / customisation / priority support), unit, price, partner cost ref; customisation and custom connections are quoted per customer as one-time or recurring order lines |
| `subscriptions` | Tenant × product: plan, period, status, start, renewal, billing entity (tenant legal entity for invoices), bundle discount |
| `subscription_addons` | Tenant × add-on: enabled, caps (e.g. SMS cap P04 Q3), billing mode (included quota / metered / separate) |
| `meter_events` | Append-only: tenant, meter (billable_employees, recruiter_seats, test_attempts, sms, ai_credits, storage_gb, api_calls, proctor_hours, partner calls…), quantity, occurred_at, source ref |
| `meter_snapshots` | Monthly billable counts per tenant × meter, with the list of counted ids (auditable); for HRMS one row per **person** (P01 person record) with `entity_days jsonb` (days active per legal entity) and the resulting cost split by entity (J15b, YX-BILL-02) |
| `invoices`, `invoice_lines`, `credit_notes` | GST tax invoices (YukthiX GSTIN → tenant GSTIN / place of supply, SAC code, CGST / SGST / IGST), IRN / QR when e-invoicing applies, status; `supply_type` (domestic / export_lut), `lut_id`, `currency`, `exchange_rate` on export invoices (S12, YX-BILL-16); `entity_split jsonb` on HRMS lines (J15b) |
| `lut_registrations` | Platform table: YukthiX's GST Letter of Undertaking per financial year: ARN, filed on, valid from / to, filed by (CA), document ref; an export invoice cannot be issued without a valid row (YX-BILL-16) |
| `foreign_receipts` | Platform table: foreign-currency receipts: gateway / bank ref, invoice ids, currency, amount, INR realised, FIRC or e-BRC number and date, status (awaiting / matched / exception) (S12, YX-BILL-17) |
| `payments`, `payment_methods`, `mandates` | Gateway refs, UPI Autopay / e-mandate / card tokens (gateway-held, never stored raw), NEFT / bank-transfer reconciliation |
| `dunning_events` | Reminders, grace, restriction, suspension steps |
| `tenant_lifecycle_events` | Trial started / converted / extended, restricted, suspended, cancelled, export ready, deleted (with deletion certificate) |
| `tenant_exports` | Full-tenant export jobs: scope, format, files, expiry, download audit |
| `platform_staff_roles` | Console roles (support, billing, compliance publisher, security, super-admin, **product analytics**), JIT grants (P12). **Step 3 (8 Oct 2026):** one all-keys staff role until staff are hired; then it splits into Support / Billing / Security (Console decisions below) |
| `tenant_health` | Adoption / usage signals for customer success (C8): active users, modules used, setup completeness (APX-E), open tickets, NPS; nightly from the P09 `platform.tenant_health.*` feed (YX-MET-15) with `health_score` (0–100), `score_factors jsonb`, `churn_risk` (low / medium / high), `computed_at` |
| `cs_messages` | Customer-success messages from YukthiX to tenant admins: `audience` (tenant list / segment rule, admin roles), `kind` (announcement / tip / survey / maintenance / **lifecycle** / **incident**; the last two added 28 Sep 2026 for P20), `channel` (in-app banner / in-app inbox / email), `body` per locale, `schedule`, `expires_at`, `created_by`, `approved_by`; delivery and read receipts per admin |
| `cs_alerts` | Churn-risk and adoption alerts to the CS team: `organization_id`, `rule`, `score_before / after`, `assigned_to`, `status` (open / contacted / resolved), `notes` (no tenant HR data) |

Tenant-scoped tables carry `organization_id` + RLS. The catalogue and console tables are platform tables (P07 YX-STAT-10 exemption). Payment card / bank data is held only by the gateway (tokens here).

## 5. Rules

### Billing (YX-BILL)

| ID | Rule |
|---|---|
| YX-BILL-01 | Each product has exactly one plan. Tenants buy products and add-ons, never tiers (D15). The bundle discount applies automatically for 2+ products. |
| YX-BILL-02 | Billable units are counted from the meter ledger using the Q1 / Q2 definitions. Every invoice line links to the monthly snapshot and the list of counted ids, which the tenant can download. **Amended 28 Sep 2026 (validation pass 3, J15b):** a billable unit is counted **once per person per product per tenant per month** across all the tenant's legal entities, using the P01 person record; a person transferred between entities in the month, or employed by two entities at once, is one unit. For accounting, the HRMS line shows the cost **split by legal entity, pro-rata by days active** in each entity that month (e.g. 10 days in A and 20 in B = ⅓ and ⅔ of one unit); the split never changes the unit count or the total. |
| YX-BILL-03 | Not billed: pre-boarders, alumni and nominees, external logins (YX-SEC-21), ATS hiring managers and panel, practice attempts, and attempts reset for a technical failure (T03). **Amended 28 Sep 2026 (J15b):** also never billed again: a second or later employment, consultant engagement or entity assignment of the **same person** in the same product and month (YX-BILL-02). |
| YX-BILL-04 | Invoices are GST tax invoices with correct place of supply and tax split, SAC code, both GSTINs, and e-invoice IRN / QR when YukthiX's turnover requires it. Corrections are made only by credit note. |
| YX-BILL-05 | Payment methods follow Q3. Card / bank credentials are never stored by YukthiX (gateway tokens only). |
| YX-BILL-06 | Plan changes: adding a product or add-on is prorated immediately; removing one takes effect at period end. Annual plans true up billable units monthly or quarterly in arrears (Q3). |
| YX-BILL-07 | Fair-use limits are shown on the usage page. Alerts go out at 80 % and 100 %. Overage follows the add-on's billing mode and cap (P04 Q3). A hard cap never blocks statutory or mandatory messages (YX-NTF-14). |
| YX-BILL-08 | Partner add-on usage is metered per call with the partner reference, so pass-through charges are auditable. |
| YX-BILL-09 | **Unit economics guard (D18):** each product's fully loaded running cost per billable unit (infrastructure, gateway fees, messaging included in the base, support, security programme share) is tracked monthly in the platform console against the $1 price; any feature whose per-unit cost would push this above the agreed margin must be metered as an add-on before release. A small minimum monthly amount applies per product. **Margin test (27 Sep 2026):** fully loaded cost per unit must be ≤ 40 % of the unit price from month 18 after launch; earlier months are expected to run at a loss because the security programme is a fixed cost (see PRICING-UNIT-ECONOMICS.md §1). |
| YX-BILL-10 | **Consultants (A8):** each consultant paid in the billing month (at least one approved invoice paid through M03 in that month, YX-PAY-38) counts as **one HRMS billable unit**, however many invoices are paid (**amended 28 Sep 2026, J15b:** once per person across all legal entities, and not again if the same person is also a billable employee that month, YX-BILL-02); they are listed in the monthly snapshot with the reason "consultant paid". The Consultant login itself is never billed (YX-BILL-03); a registered consultant with no payment that month is not counted. |
| YX-BILL-11 | **Partner add-ons with outside costs (26 Sep 2026):** the connector or integration for every partner service (EWA, benchmarking data, learning content, Aadhaar eKYC / DigiLocker, job boards) is included in the price (D18); only the partner's own charge is an add-on, metered per use (YX-BILL-08) or billed by the partner directly. **Job-board posting fees are never billed by YukthiX**: they stay on the customer's own board account. EWA funds are provided by the regulated partner; YukthiX never lends, holds or guarantees them. |
| YX-BILL-12 | **Billing starts at go-live, never at signature (G1):** the meter for a product starts on the day the tenant marks that product live (for HRMS: the go-live date or the first live payroll run, whichever comes first); the Q4 trial covers set-up and data migration; self-service onboarding carries no implementation fee (only assisted migration is paid, P15 Q3 / D18). |
| YX-BILL-13 | **Price and change commitments (G2):** at least **90 days' notice** to every tenant's admins and billing contact before any list-price **rise** (a price cut — neither the unit price nor the monthly minimum above the price it follows — may start immediately; founder, 8 Oct 2026); an **annual term's price never changes mid-term**; a feature is removed only with at least **6 months' notice** and an export path for its data (YX-TEN-05); annual renewals are announced **30 and 7 days** before the renewal date with the renewal price; **monthly plans can be cancelled at any time** from Settings › Billing & Account, effective at period end (YX-BILL-06). |
| YX-BILL-14 | **Published price list (G3):** the price of every product and add-on, the bundle / annual / band discounts and the **per-product minimum monthly amount** (YX-BILL-09) are published on the website and shown in the app before purchase and on every invoice; the minimum is kept low enough that a 5-person company pays a few dollars a month, never a seat floor. No unpublished price applies to a self-service customer. Team action: set the exact minimum (D18 example: 10 units). **Exact minimums (decided 27 Sep 2026):** HRMS ₹499 (US $5), ATS ₹999 ($10), Proctoring ₹999 ($10) charged only in a month with at least one attempt started, otherwise ₹0. |
| YX-BILL-15 | **Payment rails and bank-rail discount (27 Sep 2026):** the default payment method is **bank auto-debit (e-NACH) for monthly plans and NEFT / RTGS for annual invoices**; UPI Autopay is offered below ₹15,000 a month and cards stay available at list price. Tenants paying by e-NACH, UPI Autopay or NEFT receive a **2 % bank-rail discount** shown as a discount line, never a card surcharge. Every tenant gets a **virtual account number** so bank transfers reconcile automatically; unmatched receipts are surfaced in the Jobs & errors page (YX-INT-10). Non-INR customers pay by annual prepay, ACH or SEPA; international card fees are never absorbed into the $1 price. |
| YX-BILL-16 | **Export invoices under LUT (S12, 28 Sep 2026):** an invoice to a customer outside India that qualifies as an export of services is **zero-rated under YukthiX's GST Letter of Undertaking (LUT)**: no IGST is charged; the invoice carries the LUT reference (ARN and financial year), the words "Supply meant for export under LUT without payment of IGST", the customer's country and currency, and the INR value at the applicable exchange rate. The LUT is filed **every financial year, before the first export invoice of that year**; the billing engine refuses to issue an export invoice without a valid `lut_registrations` row and sends it to staff review, never charging or dropping IGST silently. Team action: the CA files the LUT before the first foreign invoice. |
| YX-BILL-17 | **Foreign receipts reconciliation (S12):** every foreign-currency receipt is matched to its export invoice(s) and to a **FIRC or e-BRC**; unmatched or short-realised receipts (bank charges, exchange difference) stay in the console billing queue until resolved, and the realised INR value is recorded for the GST return and the accounts. |

### Tenant lifecycle (YX-TEN)

| ID | Rule |
|---|---|
| YX-TEN-01 | Trials follow Q4. Trial data can be converted to live in place (no re-entry), or wiped if the tenant chooses. |
| YX-TEN-02 | Non-payment follows the Q5 schedule. **A restricted or suspended tenant never loses** its employees' access to their own payslips, Form 16 and letters, or statutory records the employer must keep. A payroll run already approved is never stopped mid-way. |
| YX-TEN-06 | Billing staff can override the non-payment schedule per tenant (pause, extend, step forward / back, payment plan) with a reason and expiry; overrides are audited, shown to the tenant's admins, and the automatic schedule resumes when the override expires. |
| YX-TEN-03 | On cancellation, the tenant has the Q6 grace period in read-only mode with a **full export** (all entities, documents, audit log, in open formats) before deletion. |
| YX-TEN-04 | Deletion is complete: live data deleted, keys destroyed (crypto-shredding, YX-SECOPS-02), backups age out per the retention schedule, and a **deletion certificate** is issued. Legal holds (M08 Q7, T05) are honoured, and the tenant is told what is held and why. |
| YX-TEN-05 | Whole-tenant export is available on demand at any time (not only on exit): CSV / JSON per entity + a document archive + a manifest, produced asynchronously, downloadable by System Admin with step-up (P12), audited. |
| YX-TEN-07 | **Employees keep their own documents through exit (G4):** during the Q6 30-day read-only grace every employee (and alumnus, P05) can sign in and download their own payslips, Form 16 and letters, and is told the deadline in-app and by email at cancellation and at day 23; the YX-TEN-03 / 05 export includes a **per-employee document pack** (one folder per employee: payslips, Form 16, letters, with an index) so the employer can hand documents over after deletion. |
| YX-TEN-08 | **Trial end without switching on (founder decision 28 Sep 2026).** A trial runs 30 days, plus one 14-day extension (automatic when first value is reached, otherwise self-serve on request; P20 YX-GRO-06). If no product is switched on by the end: the account becomes **read-only for 30 days** (view and full export allowed; no payroll runs, no tests sent, no jobs published, no messages to employees or candidates); reminders go to all trial admins on the first day of read-only, day 15 and day 25; on day 30 of read-only all trial data is **deleted** under YX-TEN-04 and a deletion certificate is emailed. Switching on at any point before deletion restores full use with no data loss. No card or mandate is ever charged for a trial. |

### Platform console & support (YX-CONSOLE)

| ID | Rule |
|---|---|
| YX-CONSOLE-01 | Staff act only through console roles with least privilege and JIT elevation (P12 Q7). Tenant data is reached only via P02 support sessions. Billing staff see billing data, not HR data. |
| YX-CONSOLE-02 | Every console action (plan / price change, credit note, suspension, reinstatement, statutory publish, export on behalf) is audited with staff identity and reason. Tenant-affecting actions are visible to the tenant's admins. |
| YX-CONSOLE-03 | Support follows Q8 tiers and response times. Product support is separate from the tenant's own HR helpdesk (M08). |
| YX-CONSOLE-04 | Support tickets carry the tenant's support tier. The queue always serves Priority Support tickets before Standard tickets of the same severity; Severity-1 incidents are handled 24×7 for every tier. Response / resolution targets per tier are measured and reported to Priority Support customers monthly. |
| YX-CONSOLE-05 | **Customer success (C8):** the health score and churn-risk band are computed only from the tenant-health feed (usage metadata, setup completeness, tickets, NPS / CSAT, billing status; YX-MET-15); CS staff see scores, factors and billing status, never tenant HR data (YX-CONSOLE-01); a move to high churn risk or a score fall of 20+ points in 30 days raises a `cs_alerts` item to the assigned CS owner. The tenant's System Admins can see their own score and factors. |
| YX-CONSOLE-06 | **In-app messages to tenant admins (C8)** reach only admin roles (System Admin, HR Admin, Payroll Admin, billing contact), never employees; each message is approved by a second staff member, dismissible, rate-limited (at most 2 non-critical messages per admin per week; trial lifecycle nudges follow P20 YX-GRO-03 instead, added 28 Sep 2026), tracked only for delivery / read, and marketing content respects the admin's opt-out; maintenance and security notices are always shown. |
| YX-CONSOLE-07 | **Status page, maintenance and incident notices (G5):** a public status page shows current and past availability per product and region; planned maintenance is announced to tenant admins at least **72 hours** ahead (YX-CONSOLE-06 maintenance notice, always shown) and is **never scheduled inside a tenant's payroll-critical window** — company-configurable in Settings › Billing & Account, starter template (D17) = the last 3 and first 7 calendar days of the month — nor on a statutory due date in the P07 calendar for that tenant's entities; a Severity-1 incident is posted on the status page and sent to affected tenants' admins within **30 minutes** of detection, with updates until resolved and a post-incident summary. **Amended 28 Sep 2026 (S11):** every notice uses the pre-approved stages and templates in [P20](P20-growth-trial-customer-operations.md) (investigating / identified / monitoring / resolved / post-incident; maintenance scheduled / reminder / started / completed; YX-GRO-08), and the status page is fed by the synthetic probes in the P13 brief (#6). |
| YX-CONSOLE-08 | **Product analytics access (S1, 28 Sep 2026):** the `product_analytics` schema (P09 §4.10) is readable only by YukthiX staff holding the **product analytics** console role (least privilege, P12); it holds pseudonymous usage events, never personal or HR data (YX-MET-19); access is audited (YX-CONSOLE-02); it is never joined with tenant HR data or with the billing contact list at person level; a tenant that opts out of non-essential analytics (Settings › Billing & Account) sends no product-analytics events (YX-MET-20). |

## 6. Flows
1. **Sign-up (self-serve):**
   1. Choose product(s), region (P02 Q7), company details, GSTIN.
   2. Verify email / mobile.
   3. Trial starts (Q4).
   4. Quick start lane per product (APX-E §1.6), then the setup hub (APX-E); trial nudges and "switch on" moments per [P20](P20-growth-trial-customer-operations.md).
   5. Convert: choose period and payment method, accept terms / order form (APX-G, YX-SEC-28).
   6. Subscription active.
2. **Monthly billing:**
   1. Meters snapshot on the 1st.
   2. Invoice draft.
   3. Review (auto unless an anomaly).
   4. GST invoice issued (+ IRN).
   5. Auto-debit (UPI Autopay / e-mandate / card) or bank-transfer reminder.
   6. Payment recorded and reconciled.
   7. **Export invoices (S12):** zero-rated under the current LUT (YX-BILL-16); each foreign receipt matched to its FIRC / e-BRC (YX-BILL-17).
3. **Dunning (Q5):** due → reminders → restricted → suspended → reinstated on payment (instant).
4. **Cancellation (Q6):** cancel → read-only grace → export ready (email + in-app) → final warning → deletion → certificate.
5. **Console:**
   - tenant search;
   - lifecycle actions;
   - billing adjustments (credit notes, extensions) with reason;
   - support session requests;
   - health dashboard.
6. **Customer success (C8):**
   1. Nightly: the P09 tenant-health feed updates `tenant_health` (score, factors, churn-risk band).
   2. Rules raise `cs_alerts` (high churn risk, score drop, set-up stalled > 14 days in trial, payroll not run by day 5, admins inactive 30 days, NPS detractor) to the tenant's CS owner.
   3. The CS owner acts: in-app message / announcement to that tenant's admins (YX-CONSOLE-06), email, call, a guided set-up session (P02 support session if data access is needed), or a Priority Support offer.
   4. Outcome logged on the alert; health trend visible per tenant and per cohort (sign-up month, size band, product).

## 7. UI
- **Settings › Billing & Account:**
  - products and add-ons;
  - usage vs fair use, with charts;
  - invoices (download, GST details);
  - payment methods and mandates;
  - billable-unit detail (who was counted);
  - company billing details (GSTIN, address, PO number);
  - cancel / export.
- **Trial banner** with days left and setup progress.
- **Restricted / suspended banners** with plain wording and a pay-now link.
- **Platform console (staff):**
  - tenants list and detail;
  - plans and add-ons catalogue;
  - invoices and payments;
  - dunning queue;
  - statutory publishing (P07);
  - support sessions;
  - incidents / vulnerabilities (P12);
  - health;
  - **product analytics** (S1, staff role only, YX-CONSOLE-08): funnels, time to first value, cohorts, feature adoption (P09 §4.10, P20);
  - **incidents & maintenance** (S11): notice composer from the P20 templates, status-page posts, affected-tenant targeting;
  - **export invoices** (S12): LUT register, FIRC / e-BRC matching queue;
  - **customer success** (C8): tenant health list (score, trend, churn band, factors), alerts queue, message composer (audience rule, locale, schedule, preview, second-person approval), delivery / read stats;
  - **partners (P16):** partner applications and verification queue (identity, GSTIN / PAN, ICAI registration, agreement G-34), partner list (types, hierarchy, suspend / reinstate), commission approval and payouts, consolidated partner invoices, partner-directory moderation (APX-D YX-06…08).
- **Tenant side (C8):** admins see YukthiX announcements in a banner and the notification inbox (category "From YukthiX"); Settings › Billing & Account shows the tenant's own health score with factors and next steps ("Finish leave set-up", "Invite managers to mobile").

## 8. Migration & rollout
- Existing exam-app organisations are mapped to the Proctoring (and ATS if used) product subscriptions, and existing Stripe subscriptions are honoured until renewal.
- `Plan` columns become the catalogue.
- Meters are backfilled from `AiCreditUsage`, SMS logs and attempts.
- **Before the wave-3 paid pilot:**
  - catalogue;
  - meters;
  - GST invoices;
  - Indian gateway;
  - dunning;
  - export.
- **Before public launch:**
  - self-serve sign-up and trial;
  - full console;
  - health signals;
  - person-level HRMS counting with the cost split by entity (J15b);
  - product analytics, quick start, trial journey, help centre and incident templates (P09 §4.10, P20).
- **Before the first non-INR invoice:** LUT filed and the export invoice variant live (YX-BILL-16 / 17).

## 8b. Validation pass 3 additions (founder decisions 28 Sep 2026)

Validation pass 3 items routed here (group "Growth and operations" plus J16 / R20). E-invoicing outside India (KSA, UAE, EU) is in [P21](P21-global-readiness.md) YX-GLB-12 and is not repeated here.

| ID | What it does | Rule | When |
|---|---|---|---|
| S15 | Cost per tenant (storage, egress, AI, compute) attributed and shown in the console against revenue | YX-CONSOLE-09 | Before pilot |
| J2 | Go-live payment readiness: first payroll while the auto-debit mandate is pending, payout partner KYB, funding / virtual account, balance check before release, partial payouts | YX-BILL-18 | Before pilot |
| J16 | GST invoice per legal entity / GSTIN for company groups | YX-BILL-19 | Wave 3 |
| R20 | GST e-invoice 30-day reporting guard on YukthiX invoices (AATO threshold: verify) | YX-BILL-20 | Wave 3 |
| S7 | Referral credit mechanics (programme in P20 YX-GRO-14) | YX-BILL-21 | Wave 6 |

**Rules**

| Rule | Statement |
|---|---|
| YX-CONSOLE-09 | **Cost per tenant.** Storage, egress, AI (tokens / credits) and compute are attributed per tenant daily from metering tags and shown in the console beside the tenant's billed revenue, with gross margin and a flag when cost exceeds a set share of revenue. Staff-only (same access as YX-CONSOLE-08); shared costs are allocated by a documented key, not hidden. |
| YX-BILL-18 | **Go-live payment readiness.** The first payroll can run while the auto-debit mandate is pending (one grace run; that invoice is paid by bank transfer). Salary payout is released only when payout partner KYB is approved, the funding / virtual account is set up and a balance check shows enough funds. If the balance is short, the admin chooses a partial payout (selected people) or waits; unpaid lines stay open and are never marked paid. Readiness is a go-live checklist item. |
| YX-BILL-19 | **GST invoice per legal entity.** For a company group, YukthiX raises one GST invoice per legal entity / GSTIN (billing address, GSTIN, place of supply), using the per-entity cost split from YX-BILL-10; a group can also receive one consolidated statement, in addition to the invoices, never instead. |
| YX-BILL-20 | **E-invoice 30-day guard.** While YukthiX's AATO is at or above the e-invoice 30-day reporting threshold (understood as ₹10 crore: **verify**), each YukthiX invoice must be reported to the IRP within 30 days of its date; finance is alerted from day 20 and an invoice without an IRN cannot be marked final after day 25. Threshold held as dated data. |
| YX-BILL-21 | **Referral credit.** When a referred company's first paid month is settled, both companies receive a credit equal to one month of their own bill (new company: its first paid month; referrer: its latest monthly bill), applied to the next invoices; not cash, not transferable, expires 12 months after issue. The credit shows as a separate invoice line; GST treatment follows the credit note rules. Reversed if the referred company's first payment is refunded. |

**Acceptance tests**

- A tenant with a pending mandate runs its first payroll; payout stays blocked until KYB is approved and the balance check passes; with short funds, a partial payout pays only the chosen lines and leaves the rest open.
- A group with three GSTINs receives three GST invoices whose totals equal the per-entity split.
- A YukthiX invoice with no IRN on day 26 cannot be marked final, and finance was alerted on day 20.
- The console shows a tenant's attributed cost against revenue, and a tenant whose cost passes the set share is flagged.


## 9. Acceptance tests (samples)
- An employee joining on the 20th and leaving on the 25th is (or isn't) billed per the Q1 definition. The invoice detail lists them either way with the reason (YX-BILL-02).
- A pre-boarder and a POSH external member are never counted (YX-BILL-03).
- A Karnataka tenant billed from a Karnataka GSTIN gets CGST + SGST; a Maharashtra tenant gets IGST (YX-BILL-04).
- A suspended tenant's employees can still download their payslips and Form 16 (YX-TEN-02).
- Cancelling produces a full export. After the grace period the tenant's keys are destroyed and a deletion certificate is issued (YX-TEN-03/04).
- Removing an add-on mid-month keeps it until period end; adding one prorates immediately (YX-BILL-06).
- A billing-support staff member can't open a tenant's employee records (YX-CONSOLE-01).
- A tenant whose admins stop signing in for 30 days and whose score falls from 80 to 55 raises a churn-risk alert with factors; the CS view shows no employee names (YX-CONSOLE-05).
- A YukthiX announcement is shown to the tenant's System Admin but not to employees, and cannot be sent without a second staff approval (YX-CONSOLE-06).
- A Naukri posting made through the connector creates no YukthiX invoice line (YX-BILL-11).
- A tenant that signs on the 3rd and marks HRMS live on the 20th is billed from the 20th; the set-up days are free (YX-BILL-12).
- A planned maintenance window on the 2nd of the month is refused for a tenant whose payroll-critical window is the last 3 / first 7 days; a Sev-1 posted at 10:00 reaches admins by 10:30 (YX-CONSOLE-07).
- During the 30-day exit grace an employee downloads their Form 16; the tenant export contains one document folder per employee (YX-TEN-07).
- An employee transferred on the 11th from entity A to entity B (30-day month) is **one** HRMS unit; the invoice shows 10/30 of the unit against A and 20/30 against B (YX-BILL-02, J15b).
- A consultant who is also on payroll as an employee in the same month is counted once (YX-BILL-03 / 10).
- An invoice to a Singapore customer carries no IGST and shows the LUT reference and export wording; with no valid LUT for the year the invoice goes to staff review instead of being issued (YX-BILL-16).
- A USD receipt with no FIRC / e-BRC stays in the matching queue at month end (YX-BILL-17).
- A billing staff member without the product analytics role cannot open the funnel dashboards; an opted-out tenant produces no product-analytics events (YX-CONSOLE-08).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | HRMS "billable employee" | An employee with an **active employment on any day of the billing month** (includes joiners and leavers that month, excludes pre-boarders, alumni, external logins); counted **once per person across all legal entities** (amended 28 Sep 2026, J15b) and shown with the list and the cost split by entity. |
| Q2 | ATS & Proctoring units | **ATS: per recruiter seat** (users holding recruiter / hiring-admin roles; hiring managers and panel free). **Proctoring: per test attempt started** (practice and tech-failure resets free; retakes count). Staffing desk included in ATS. |
| Q3 | Billing period & payment | **Monthly or annual (annual discount)**, prepaid; employee / seat growth trued up monthly in arrears; payment by **Razorpay (UPI Autopay, e-mandate, cards, net banking)** and **NEFT / RTGS for annual invoices**; **Stripe** for non-INR customers; GST e-invoicing once YukthiX's turnover crosses the threshold. |
| Q4 | Free trial | **30 days, no card**, all chosen products; demo data option (P15 sandbox); **live bank files, statutory filings, partner add-ons and bulk WhatsApp / SMS disabled in trial**; one extension of 15 days on request. |
| Q5 | Non-payment | Reminders at due date, +3, +7; **read-only admin at +15 days** (employees unaffected); **suspended at +30** (employees keep payslips / Form 16 / letters, YX-TEN-02); data kept **90 days** after suspension, then the cancellation path; instant reinstatement on payment. |
| Q6 | Leaving YukthiX | **30 days read-only grace** with full export, reminder at day 23, deletion at day 30 + crypto-shredding + deletion certificate; backups age out within 35 days; legal holds explained. |
| Q7 | Plan changes & discounts | Add = immediate prorated; remove = at period end; **bundle discount automatic** for 2+ products; annual prepay discount; volume pricing by employee band inside the single plan (team to set numbers). |
| Q8 | Customer support | **Included for all** (D15): in-app chat + email, **Mon–Sat 9:00–19:00 IST**, extended hours on payroll days (last 3 working days + first 5 of the month), **24×7 for Severity-1 incidents**; response targets Sev-1 1 h, Sev-2 4 h, Sev-3 1 business day; help centre + in-app help (APX-D §6). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Billable employee = active employment on any day of the billing month** (joiners and leavers count once; pre-boarders, alumni, nominees, external logins never); counted per legal entity with the full list on the invoice (YX-BILL-02/03). **Amended 28 Sep 2026 (J15b):** counted **once per person per product per tenant per month** across all legal entities; the invoice splits the cost by entity pro-rata by days. | 26 Sep 2026 |
| Q2 | **ATS: per recruiter seat** (users holding recruiter / hiring-admin roles; hiring managers and panel free; staffing desk included). **Proctoring: per test attempt started** (practice and technical-failure resets free; retakes count; employee training attempts count under Proctoring only if the tenant has the Proctoring product, otherwise included in HRMS learning). | 26 Sep 2026 |
| Q3 | **Monthly or annual (annual discount), prepaid**; growth in billable units trued up monthly in arrears; payment via **Razorpay** (UPI Autopay, e-mandate, cards, net banking), **NEFT / RTGS** for annual invoices, **Stripe** for non-INR customers; GST e-invoicing (IRN) once YukthiX crosses the turnover threshold (YX-BILL-04–06). Team action: open Razorpay and Stripe accounts; set discount percentages. | 26 Sep 2026 |
| Q4 | **30-day free trial, no card**, all chosen products, optional demo data (P15); **disabled in trial:** live bank files / payouts, statutory filings, partner add-ons, bulk WhatsApp / SMS; one 15-day extension on request; trial data converts in place or can be wiped (YX-TEN-01). | 26 Sep 2026 |
| Q5 | **Both:** an automatic schedule — reminders at due date, +3, +7; **read-only admin at +15**; **suspended at +30**; employees keep their own payslips / Form 16 / letters and an approved payroll run is never stopped (YX-TEN-02); data kept 90 days after suspension, then the cancellation path; instant reinstatement on payment — **plus manual control by YukthiX staff** in the console: pause the schedule, extend a deadline, move a tenant forward or back a step, or agree a payment plan, each with a reason, audited and visible to the tenant's admins (YX-CONSOLE-02). | 26 Sep 2026 |
| Q6 | **30 days read-only grace** with a **full export** (all entities, documents, audit log; open formats); reminder at day 23; **deletion at day 30** with crypto-shredding and a **deletion certificate**; backups age out within 35 days; legal holds explained to the tenant (YX-TEN-03/04). | 26 Sep 2026 |
| Q7 | **Add = immediate, prorated; remove = at end of the paid period**; **bundle discount automatic** for 2+ products; **annual prepay discount**; **volume pricing by employee band** inside the single plan (YX-BILL-01/06). Team action: set band boundaries, prices and discount percentages. | 26 Sep 2026 |
| Q8 | **Standard support included for all:** in-app chat + email, Mon–Sat 9:00–19:00 IST, extended hours on payroll days (last 3 + first 5 working days), tickets worked in queue order, help centre + in-app help; **Severity-1 incidents (outage, payroll blocked, security) 24×7 for every customer**. **Plus a paid Priority Support add-on** (user decision): priority queue (always picked before standard), faster targets (e.g. Sev-2 1 h, Sev-3 4 h response; resolution targets per contract), phone / WhatsApp channel, extended hours, named support contact, quarterly review. Amends spec D15 (support is included; priority support is an add-on). Team action: set Priority Support price and exact targets. | 26 Sep 2026 |
| D18 | **Price points (spec D18):** $1 per billable unit per month per product (HRMS employee, ATS recruiter seat, Proctoring attempt), INR equivalent set by the team; bundle / annual / band discounts apply on top; **minimum monthly amount per product** (e.g. = 10 units); cost drivers only as add-ons. New rule YX-BILL-09. | 26 Sep 2026 |
| D18b | **Paid extras are only (founder, 26 Sep 2026):** storage beyond fair use · AI credits · third-party services (partner pass-through incl. SMS / WhatsApp message costs) · custom third-party connections built for one customer · customisation work for one customer · Priority Support. All built features are included; prices are exclusive of GST / taxes, which are added on every invoice. The `addons` catalogue gains types `custom_connection` and `customisation` (one-time or recurring, quoted per customer, approved order line). | 26 Sep 2026 |
| A8 (consistency fix) | **Consultants paid in the month are HRMS billable units** (M03 A8-Q1): one unit per consultant per legal entity in any month with a payment, listed in the snapshot; the Consultant login is not billed. Complements Q1. §3, YX-BILL-10. | 26 Sep 2026 |
| C8 | **Gap-register extension (user decision 26 Sep 2026): customer-success tooling.** Health score (0–100) and churn-risk band per tenant from adoption, setup completeness, tickets, NPS / CSAT and billing status (P09 tenant-health feed, YX-MET-15); in-app messages / announcements to tenant admins only, second-person approved and rate-limited; churn-risk alerts to the YukthiX CS owner with an outcome log; tenants see their own score and next steps. Tables `cs_messages`, `cs_alerts`; rules YX-CONSOLE-05/06; flow 6. Before public launch; included (D18). | 26 Sep 2026 |
| Add-ons (B8, B10, C2, C3, C6) | **Gap-register extension (user decision 26 Sep 2026): new partner add-ons in the catalogue** — earned wage access (partner-funded, partner fee passed through, YukthiX never lends), compensation benchmarking data, learning content licences, Aadhaar eKYC / DigiLocker verifications; **job-board posting costs are the customer's own** on their board account, never resold. The connectors themselves are included in the price (D18). Rule YX-BILL-11. Team action: sign partner agreements and set pass-through prices. | 26 Sep 2026 |
| P16 follow-up | **Partner billing and console (P16 Q3, YX-PTR-11 / 13).** Partner billing modes per client: direct billing at the D18 price + monthly referral commission, or a consolidated partner invoice at a partner discount re-billed by the partner; the client's price is never above the published price; rates pass YX-BILL-09; an ownership transfer moves the billing account with ownership. Platform console adds partner applications / verification, partner list, commission approval and directory moderation (§3, §7). No new rule IDs. | 26 Sep 2026 |
| G1 | **Market analysis additions (G1–G5), founder decision: billing starts at go-live**, never at signature — meter from the product's go-live date (HRMS: go-live or first live payroll); trial covers set-up; no implementation fee for self-service. New rule YX-BILL-12. | 26 Sep 2026 |
| G2 | **Market analysis additions (G1–G5): change commitments** — ≥ 90 days' notice of any list-price change, annual terms never change mid-term, ≥ 6 months' notice before a feature is removed (with an export path), renewal reminders 30 and 7 days before an annual renewal, monthly plans cancel any time. New rule YX-BILL-13. | 26 Sep 2026 |
| G3 | **Market analysis additions (G1–G5): published price list** for every product and add-on incl. the per-product minimum, on the website and in the app; the minimum stays small enough that a 5-person company pays a few dollars. New rule YX-BILL-14. Team action: set the exact minimum amount (D18). | 26 Sep 2026 |
| G4 | **Market analysis additions (G1–G5): employees keep their own documents through exit** — during the 30-day grace each employee downloads own payslips / Form 16 / letters; the tenant export includes per-employee document packs. New rule YX-TEN-07 (extends YX-TEN-03 / 05). | 26 Sep 2026 |
| G5 | **Market analysis additions (G1–G5): status page and maintenance** — public status page; maintenance notices ≥ 72 h to admins; no planned maintenance in the payroll-critical window (company-configurable; starter = last 3 and first 7 days of the month) or on statutory due dates; incident notices within 30 min. New rule YX-CONSOLE-07. | 26 Sep 2026 |
| E2 / E3 | **Pricing & unit economics (27 Sep 2026, PRICING-UNIT-ECONOMICS.md):** minimums HRMS ₹499 / ATS ₹999 / Proctoring ₹999 in active months (YX-BILL-14); default rails e-NACH monthly and NEFT annual, 2 % bank-rail discount, virtual account per tenant, no card surcharge (YX-BILL-15); YX-BILL-09 margin test ≤ 40 % of price from month 18. The founder confirmed the **$1 price is a market-capture strategy, not a profit price**; no founding-customer discount below $1 is offered. **Partner commission rates deferred** to the founder's market research (P16). | 27 Sep 2026 |
| J15b | **Validation pass 3 Must (J15b), founder decision 28 Sep 2026 (option A): no double count across legal entities.** A billable unit is counted once per person per product per tenant per month across all legal entities, using the P01 person record; an inter-entity transfer or concurrent employment is one unit, and consultants follow the same rule. The invoice shows the cost split by legal entity pro-rata by days active, for the tenant's accounting. YX-BILL-02 / 03 / 10 and Q1 amended. | 28 Sep 2026 |
| S12 | **Validation pass 3 Must (S12), founder decision 28 Sep 2026: export of services zero-rated under a GST LUT.** LUT filed every financial year; export invoices carry the LUT reference and "Supply meant for export under LUT without payment of IGST"; no export invoice without a valid LUT; foreign receipts reconciled to FIRC / e-BRC. New rules YX-BILL-16 / 17; tables `lut_registrations`, `foreign_receipts`. Team action: the CA files the LUT before the first foreign invoice. | 28 Sep 2026 |
| S1 | **Validation pass 3 Must (S1), founder decision 28 Sep 2026 (option C): own product analytics on the P09 metric layer.** Separate `product_analytics` schema readable only by the YukthiX **product analytics** console role; pseudonymous, no personal or HR data; tenant opt-out of non-essential analytics. New rule YX-CONSOLE-08; metric definitions in P09 §4.10 (YX-MET-19–21); business use in P20. | 28 Sep 2026 |
| S11 | **Validation pass 3 Must (S11), founder decision 28 Sep 2026: incident and maintenance message templates.** YX-CONSOLE-07 notices use the P20 templates (YX-GRO-08); the status page is fed by the P13 synthetic probes; `cs_messages.kind` gains `lifecycle` and `incident`. | 28 Sep 2026 |
| Trial end | **Founder decision 28 Sep 2026 (option B):** trial 30 days + one 14-day extension (automatic at first value, else self-serve), then 30 days read-only with export and reminders, then deletion with certificate unless switched on. New rule YX-TEN-08. | 28 Sep 2026 |
| S15 | **Validation pass 3 Should (S15), founder decision 28 Sep 2026: cost per tenant attributed and shown against revenue in the console.** Rule YX-CONSOLE-09. | 28 Sep 2026 |
| J2 | **Validation pass 3 Should (J2), founder decision 28 Sep 2026: go-live payment readiness (grace first run, KYB, funding account, balance check, partial payouts).** Rule YX-BILL-18. | 28 Sep 2026 |
| J16 | **Validation pass 3 Should (J16), founder decision 28 Sep 2026: GST invoice per legal entity / GSTIN for groups.** Rule YX-BILL-19. | 28 Sep 2026 |
| R20 | **Validation pass 3 Should (R20), founder decision 28 Sep 2026: e-invoice 30-day reporting guard on YukthiX invoices (AATO threshold to verify); non-India e-invoicing in P21 YX-GLB-12.** Rule YX-BILL-20. | 28 Sep 2026 |
| S7 | **Validation pass 3 Should (S7), founder decision 28 Sep 2026: referral credit mechanics (programme in P20 YX-GRO-14).** Rule YX-BILL-21. | 28 Sep 2026 |
| Console 1 | **Founder decision 8 Oct 2026 (step 3 console): one staff role for now.** Every YukthiX staff account holds all console keys (each route still checks its own key, audited). When staff are hired it splits into **Support** (support sessions, companies read), **Billing** (plans, prices, lifecycle) and **Security** (audit log, shared channels); `platform_staff_roles` (§4) carries them. | 8 Oct 2026 |
| Console 2 | **Founder decision 8 Oct 2026: support sessions stay read-only** (P02 Q8, YX-SEC-20); no write access for staff inside a company. | 8 Oct 2026 |
| Console 3 | **Founder decision 8 Oct 2026: closing a company is instant for now** (console action with a reason, everyone signed out). The **30-day read-only grace with full export before deletion** (Q6, YX-TEN-03/04/07) is built with billing; until then a closed company's data is kept, not deleted. | 8 Oct 2026 |
| Console 4 | **Founder decision 8 Oct 2026: price cuts may start at once.** A new price whose unit price and monthly minimum are both no higher than the price it follows may start today; a **rise** (either part higher) still starts at least 90 days out, and a cut slotted in before a planned price may not turn that one into a short-notice rise. YX-BILL-13 amended. API + console screen; no database rule (prices stay dated, a price in force is never changed or removed). | 8 Oct 2026 |
| Console 5 | **Founder decision 8 Oct 2026: YukthiX welcome email for a new company's first System Admin**, replacing the old exam-app email: the YukthiX account-email layout (MJML), plain warm wording, set-your-password link. YukthiX-owned, not company-editable (P04 Q5 build note). | 8 Oct 2026 |
