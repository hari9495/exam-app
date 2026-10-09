# M11 · Benefits Administration & Flexible Benefit Plan

> **Status:** ✅ Decided (5/5), 26 Sep 2026.
> **Covers:** spec §1.3.6 (Benefits Administration: insurance enrolment, flexible benefit declarations), GAP-REGISTER **A6** (plus B17's NPS item), and the Frappe reference [03 §D.5](../reference/frappe-hrms-functional-spec/03-payroll-engine.md) (flexible benefits; defects D-D6, D-D7).
> **Builds on:**
> - M01: family, nominees, lifecycle events, F&F;
> - M03: CTC templates, components, tax workspace, YX-TAX rules, one-time pay;
> - P07: exemption caps, 80D / 80CCD(2), perquisite rules;
> - P05: documents and bills;
> - P03: approvals;
> - P10 / D18: partner connectors are third-party add-ons;
> - APX-E: setup cards and policy editors;
> - APX-A / APX-B: notifications and events.
>
> **D17:** every benefit policy (plans, eligibility, sharing, windows, limits) is company-configured from a labelled starter template. **D18:** all benefit features are included in the $1 price; insurer / broker / meal-card partner calls are third-party add-ons.
> **Build wave:** 3 (with payroll, for the pilot). Insurer / broker connectors can follow in a later wave.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
- Let companies offer and administer employee benefits:
  - group health (GMC), accident (GPA) and life (GTL) insurance with dependants;
  - a **flexible benefit plan (FBP)** inside the CTC;
  - employer NPS;
  - other benefits (wellness, gym, parents' insurance top-up and so on).
- Deduct and exempt them correctly in payroll and tax.

Out of scope:
- statutory PF / ESI / gratuity (M03);
- statutory bonus (M03);
- expense reimbursements (M05).

## 2. What exists today

| Capability | Today | M11 |
|---|---|---|
| Frappe flexible benefits | Application / claim / ledger; defects D-D6 (claim trusts browser value) and D-D7 (accrual beyond yearly total) | Reference only (clean-room); fix both by design |
| M01 | Family members, nominees (`employee_nominations`), lifecycle events | **Reuse** for dependants and nominees |
| M03 | CTC templates, components with flags, tax workspace, declarations / proofs | **Extend**: FBP basket inside templates; benefit deductions and exemptions |
| P07 | Exemption sections, caps | **Extend**: FBP component caps, 80D, 80CCD(2), meal / food coupon rules per regime |

## 3. Concepts
- **Benefit plan:** a company offering. Types:
  - insurance (GMC / GPA / GTL / parental top-up);
  - FBP;
  - NPS;
  - other.

  Each plan has eligibility (entity, grade, employment type, tenure; D17), a dated plan year, a provider (insurer / broker / partner, optional), a cost-sharing rule (employer / employee / split), coverage options and a default.
- **Insurance coverage:**
  - employee + dependants: spouse, children, parents / in-laws per plan rules;
  - sum-insured options;
  - top-ups;
  - premium (employer part, employee part → payroll deduction, 80D where applicable);
  - policy number and e-card.
- **Enrolment window:** annual open enrolment, joining (N days after joining), and **life events** (marriage, birth / adoption, dependant death, divorce). Each has its own deadline (D17 starter: 30 days for joiners and life events).
- **Endorsement:** an add or delete of a member mid-year (join / exit / life event), sent to the insurer or broker (Q1); it carries pro-rata premium.
- **FBP (flexible benefit plan):** part of the CTC reserved as a basket the employee allocates across approved heads (e.g. meal card, fuel & vehicle, LTA, telephone / internet, books & periodicals, uniform, gadget). The heads and their limits come from the company (D17) within P07 caps. Allocations are paid monthly or on claim (with bills). The **taxable balance sweep** at year end (or exit) pays any unclaimed or unproven amount as taxable salary.
- **Regime awareness:** most FBP exemptions apply only under the old tax regime. The tax workspace (M03) shows each head's tax effect under both regimes (Q2).
- **NPS (employer contribution):** a component, a % of basic + DA within the P07 80CCD(2) limit per regime, with an employee choice where the company allows it, and a contribution file / API to the NPS point of presence (Q4).
- **Benefit statement:** each employee's total rewards view: CTC, benefits, employer costs.

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `benefit_plans` | type, name, provider, plan year (dated), eligibility rule, cost-sharing rule, options JSON, status |
| `benefit_plan_options` | sum insured / tier / top-up option, premium per member type, employer / employee share |
| `benefit_enrolments` | employee × plan × plan year: option, dependants covered, status (pending / confirmed / waived), window type (open / joining / life event), confirmed_at |
| `covered_members` | enrolment × family member (M01) with relationship, DOB, start / end dates, e-card ref |
| `endorsements` | add / delete / change, member, effective date, pro-rata premium, provider status (draft / sent / accepted / rejected), provider ref |
| `fbp_baskets` | employee × FY: basket amount (from compensation), allocations per head, regime snapshot, status |
| `fbp_claims` | head, period, amount claimed, bills (P05 documents), verified amount, verifier, status |
| `fbp_ledger` | append-only: allocation, monthly payout, claim approved, carry-forward, year-end taxable sweep |
| `nps_accounts` | employee PRAN (Special), contribution % (employer / employee), POP ref, status |
| `benefit_costs` | monthly employer / employee cost per plan per employee (feeds P09 and M03 CTC) |

All tables carry `organization_id` + RLS. Health and dependant data are **Special** (P02). Premiums and baskets are **Confidential**.

## 5. Rules (YX-BEN)

| ID | Rule |
|---|---|
| YX-BEN-01 | Eligibility, cost sharing, options, windows and FBP heads / limits are company policies (D17) with starter templates; legal caps from P07 can't be exceeded. |
| YX-BEN-02 | Enrolment is only possible inside a window (open enrolment, joining, or a life event with its deadline). Outside a window, only HR can change it, with a reason. |
| YX-BEN-03 | Joining and exit create endorsements automatically (add on joining / enrolment, delete at the last working day + plan grace). Life events create an endorsement when the employee submits the event with proof. |
| YX-BEN-04 | The employee's premium share and top-ups become payroll deductions (M03). 80D-eligible amounts flow to the tax workspace automatically; employer-paid group premiums are not taxable to the employee. |
| YX-BEN-05 | The FBP basket is funded from the compensation (M03 template). Allocations may be changed only in the company's allocation window. The sum of allocations never exceeds the basket (server-validated, fixes D-D6). |
| YX-BEN-06 | FBP claims are verified against bills and head limits on the server. Accrual stops once the yearly head total is reached (fixes D-D7). Unclaimed or unproven amounts are paid as taxable salary in the year-end sweep or F&F (M01). |
| YX-BEN-07 | The tax treatment of each FBP head follows P07 per regime. The employee sees the tax effect under both regimes before allocating (Q2). |
| YX-BEN-08 | Employer NPS contribution stays within the P07 80CCD(2) limit for the employee's regime; any excess is taxable. Contribution files / API calls reconcile to payroll every month. |
| YX-BEN-09 | Health and dependant data are Special class: visible to the employee and benefits admins in scope only, never to managers; sent to providers only as needed for coverage (P10 / D18 connector). |
| YX-BEN-10 | Provider integrations (insurer, broker, meal card, NPS POP) are third-party add-ons (D18). Without one, the same data is exported as the provider's file format for manual upload. |
| YX-BEN-11 | Companies can create their own benefits in a **generic benefit catalogue** (type *other*), each with eligibility, cost sharing, payroll / claim / vendor-payment treatment and tax treatment chosen from P07 categories; custom benefits appear in enrolment, the benefit statement and cost reports like built-in ones. |

## 6. Flows
1. **Set-up (APX-E card "Benefits"):**
   1. Create plans from starter templates (GMC 3 L family floater, GPA, GTL, FBP heads, NPS).
   2. Set eligibility and sharing.
   3. Connect the provider (optional add-on).
   4. Set the enrolment windows.
2. **Enrolment:** window opens → employee notified (APX-A) → choose option, add dependants (from M01 family), see premium share and tax effect → confirm → endorsement → e-card available in Me › Benefits.
3. **Life event:** employee reports marriage / birth with proof → HR verifies → dependant added → endorsement → pro-rata premium deduction.
4. **FBP year:**
   1. Allocate in the window.
   2. Monthly payout or claims with bills.
   3. Verification.
   4. Year-end sweep (unclaimed → taxable).
   5. Form 16 / 12BA reflect it.
5. **Exit:** endorsement to delete at LWD + grace; FBP balance settled in F&F; NPS contribution stops.

## 7. UI
- **Me › Benefits** (mobile + desk): my coverage and e-cards, dependants, FBP basket with the tax effect under each regime, claims with bill upload, benefit statement (total rewards).
- **HR › Benefits:** plans, enrolment dashboard (enrolled / pending / waived), endorsement queue with provider status, FBP claims verification queue, costs by plan / department (APX-C).
- **Settings › Payroll & Statutory › Benefits:** policy editors (APX-E).

## 8. Migration & rollout
- **Wave 3:** plans, enrolment, endorsements (file export), premium deductions, FBP basket / claims / sweep, NPS component + file.
- **Later:** insurer / broker / meal-card / NPS POP API connectors as add-ons (Q1, Q3, Q4).
- Import current coverage and FBP balances through P15 templates.

## 9. Acceptance tests (samples)
- An employee joining on 10 Oct is added to GMC with an endorsement dated 10 Oct and a pro-rata deduction in October payroll (YX-BEN-03 / 04).
- A claim of ₹5,000 against a meal head with ₹2,200 left is verified at ₹2,200 on the server (YX-BEN-05 / 06; D-D6).
- A head's accrual stops once its yearly total is reached (D-D7).
- At year end, ₹8,000 of unclaimed LTA is paid as taxable salary and shows in Form 16 (YX-BEN-06).
- A manager opening a team member's profile can't see dependants' health data (YX-BEN-09).
- A new-regime employee sees that the fuel head is taxable for them before allocating (YX-BEN-07).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Insurance depth | **In-product enrolment, dependants, endorsements, premium deductions, e-cards and 80D** for all; provider exchange by **standard file export** (included) or **broker / insurer API connectors** (Plum, Loop, Nova, direct insurers) as third-party add-ons; claims stay with the insurer / TPA, with status shown only when a connector provides it. |
| Q2 | FBP and the new tax regime | **FBP available to everyone**; the tax effect under both regimes is shown before allocating; under the new regime, heads that aren't exempt are paid as taxable salary (the employee may also choose to keep the amount as regular cash); the year-end sweep applies to all. |
| Q3 | Meal cards / vouchers | **Payroll deduction + partner file export included**; direct card-provider integration (Pluxee / Sodexo, Zeta, etc.) as a third-party add-on. |
| Q4 | NPS | **Employer NPS component** (% of basic + DA, within the 80CCD(2) limit per regime) + employee opt-in where the company allows + monthly contribution file for the NPS POP (included); **corporate NPS enrolment / POP API** as a third-party add-on. |
| Q5 | Other benefits | A **generic benefit catalogue** (wellness, gym, EAP, parents' insurance, childcare, learning allowance…) with eligibility, cost sharing and payroll / claim treatment, so companies add their own benefits without custom work. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Full insurance administration in-product for all:** enrolment, dependants, endorsements (join / exit / life events), premium-share payroll deductions, 80D, e-cards; provider exchange by **standard file export (included)** or **broker / insurer API connectors** (Plum, Loop, Nova, direct insurers) as **third-party add-ons** (D18); claims stay with the insurer / TPA, status shown only via a connector (YX-BEN-03/04/10). | 26 Sep 2026 |
| Q2 | **FBP available to every employee**; the tax effect of each head under **both regimes** is shown before allocating; under the new regime non-exempt heads are paid as taxable salary or the employee keeps the amount as regular cash; year-end sweep of unclaimed amounts applies to all (YX-BEN-06/07). | 26 Sep 2026 |
| Q3 | **Meal cards / vouchers:** amounts handled in payroll + provider-format file export (included); direct card-loading integration (Pluxee / Sodexo, Zeta, etc.) as a third-party add-on (YX-BEN-10). | 26 Sep 2026 |
| Q4 | **Employer NPS component** (% of basic + DA within the P07 80CCD(2) limit per regime, excess taxable) + employee opt-in where the company allows + **monthly contribution file for the NPS POP (included)**; corporate NPS enrolment / POP API as a third-party add-on (YX-BEN-08/10). | 26 Sep 2026 |
| Q5 | **Generic benefit catalogue:** HR creates any benefit (wellness, gym, EAP / counselling, childcare, parents' insurance, learning allowance…) with eligibility, cost sharing and treatment (payroll deduction / payment, claim with bills, direct vendor payment), shown in the total-rewards statement; no custom work needed. New rule YX-BEN-11. | 26 Sep 2026 |
