# P16 · Partner & Accountant Console

> **Status:** ✅ Decided (6/6), 26 Sep 2026. Q5 and Q6 are decided by principle (D15 / D17).
> **Covers:** GAP-REGISTER **A7**:
> - one CA-firm or payroll-bureau login serving many client companies (tenants);
> - a cross-client compliance dashboard;
> - partner-managed tenants and a reseller hierarchy;
> - a "payroll bureau operator" role;
> - managed payroll delivered by partners.
>
> Competitors: greytHR partner programme, Keka partner network, Zoho Payroll accountant edition, RazorpayX Payroll for CAs, Gusto / Deel accountant dashboards (global).
>
> **Builds on:**
> - P01: tenancy, entities;
> - P02: access, support sessions YX-SEC-20, external logins YX-SEC-21 / 33, proctor-grant pattern YX-SEC-23;
> - P03: approvals;
> - P07: statutory calendar;
> - P08: locks and audit;
> - P09: metrics and the tenant-health feed;
> - P11: API and white-label;
> - P12: MFA, SSO, JIT;
> - P14: billing, platform console, add-ons;
> - P15: migration, sandbox;
> - M03: payroll runs, filings.
>
> **Pricing (D18):** client companies pay the same $1 per user per product. There are no partner tiers.
> **Build:** wave 3, with the payroll pilot. All partner types are included (Q1).

---

## 1. Purpose & scope
In India, a large share of SMB payroll and compliance is run by **CA firms and payroll bureaus**, not in-house HR. The console gives them:
- one login to many client companies;
- a single view of what is due, late or blocked across all clients;
- tools to run payroll and filings for clients safely, with the client staying the data owner.

It also gives **resellers / referral partners** a way to bring customers and be paid.

**Not in scope:** YukthiX itself running clients' payroll as a service (Q4). Partner accounting software is not in scope either; that is P10 connectors.

## 2. What exists today
- **Exam app:** agencies in ATS (staffing), a super-admin impersonation feature (replaced by YX-SEC-20 sessions).
- **Design:**
  - P02 has external-login templates and a per-session support grant;
  - P14 has one billing account per tenant, no partner hierarchy;
  - P07 has the statutory calendar per entity.
- **Missing:** a partner organisation, tenant ownership by a partner, cross-tenant access for non-YukthiX people, a consolidated dashboard, partner billing and commission.

## 3. Concepts
- **Partner organisation:** a firm registered with YukthiX. Types:
  - **Accountant / CA firm:** payroll, statutory filings, TDS, audits for clients.
  - **Payroll bureau:** full managed payroll and HR operations for clients.
  - **Reseller / referral partner:** sells and onboards; may or may not operate the client.
  - **Implementation partner:** migration and setup (P15).

  One firm can hold several types. A partner has its own users, teams, roles, MFA / SSO policy (P12) and branding.
- **Partner verification:** firm details, GSTIN / PAN, for CAs the ICAI firm registration number, and an agreement accepted (APX-G partner agreement). The status is pending → verified → suspended.
- **Client link:** partner × client tenant, with:
  - a **relationship type:** operates / advises / resold-only;
  - a **grant:** which modules, entities and actions the partner's users may use;
  - who approved it on the client side;
  - start / end dates and status.

  Ownership is chosen **when the tenant is created** (Q2), and can be transferred later:
  - **Client-owned** (starter template): the client company is the account owner. A client admin can see, change or end the grant at any time. When the link ends, partner access stops immediately and the data stays with the client.
  - **Partner-owned:** the partner is the account owner and main admin, typical for a bureau running everything for a small client. The client still has a **named client contact** with rights the partner can't remove:
    - see who has access and the audit log;
    - take a full export at any time (YX-TEN-05);
    - ask for **transfer of ownership** to the client.

  In both models the employer company stays the data fiduciary under DPDP, and employees always keep access to their own payslips, Form 16 and letters (YX-TEN-02).
- **Ownership transfer:** either side starts it, and YukthiX verifies the requester.
  - Partner-owned → client-owned completes after a notice period set in the partner agreement (starter 30 days, never more than 30). The partner can't block it; open payroll runs are finished or handed over.
  - Client-owned → partner-owned needs the client owner's approval.
  - The billing account moves with ownership.
- **Partner roles (templates, editable):**

  | Role | What it can do |
  |---|---|
  | **Partner admin** | Manage the firm, users, client links |
  | **Payroll bureau operator** | Prepare and process payroll, inputs, arrears, off-cycle runs; submit for client approval |
  | **Compliance / filing operator** | Prepare statutory returns, challans, TDS, registers; file through M03 / P07 flows |
  | **Reviewer / partner** (the CA) | Review and sign off; DSC signing where the client has authorised it |
  | **Read-only auditor** | View reports, registers, audit trail for audits |
  | **Sales / onboarding** (resellers) | Create trials, invite clients, track deals; no HR data |

  Each partner user is assigned to specific clients, not to all clients by default.
- **Maker-checker across firms:** partner operators prepare work. Money-moving and filing steps need an **approver on the client side** unless the client delegates that approval to the partner in the grant (D17: company decides). Approval always follows P03, so bank-file release still needs step-up MFA (P12).
- **Cross-client dashboard:** one view across all the partner's clients:
  - payroll status per client and month (inputs pending / processing / awaiting client approval / paid / locked);
  - statutory calendar across clients (PF, ESI, PT, LWF, TDS, 24Q / 26Q, registers) with due / late / filed;
  - blockers (attendance exceptions, missing bank details, unverified PAN);
  - tasks and SLA.

  It shows **status and counts only**. Opening a client's details enters that client's tenant under the grant, with a visible "working in: Client X" banner, and is audited in the client's audit log.
- **Client-created vs partner-created tenants:**
  - a client can invite its CA (client-created, client-owned);
  - a partner can create a tenant for a new client and choose client-owned or partner-owned at creation (Q2). A named client contact is always invited.
- **Reseller hierarchy:** a partner may have sub-partners, **two levels at most**: master partner → partner. Commission and reporting roll up.
- **Partner billing and commission (Q3):** the partner chooses per client.
  - **(a) Direct:** YukthiX invoices the client at the published D18 price, and the partner earns a **monthly referral commission** (a % of that client's subscription, excluding add-on pass-through costs and taxes).
  - **(b) Partner-billed:** YukthiX sends the partner one **consolidated GST invoice** for all its partner-billed clients at a **partner discount**. The partner re-bills its clients with its own service fee. The client's YukthiX price shown in its tenant never exceeds the published price.

  The percentages are set by YukthiX in the partner programme (team action). They must pass the YX-BILL-09 unit-economics guard, because at $1 the margin is thin. A non-paying partner-billed account follows the P14 non-payment schedule, but the client can switch to direct billing to avoid suspension.
- **Partner directory:** verified partners can list themselves (services, states, languages, client size, fee range) in a directory inside YukthiX. A client picks a partner and sends a link request. YukthiX doesn't rank partners by payment. Ranking uses fit and verified reviews from linked clients.
- **Partner workspace:**
  - the partner's own task board across clients;
  - document requests to clients (payroll inputs, investment proofs), which reuse P05 document requests;
  - a notes / communication log per client;
  - templates the partner reuses across clients: salary structures, letter templates and import mappings. They are **copied** into a client, never linked live.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `partners` | Firm: name, types, GSTIN / PAN, ICAI / registration no., verification status, parent partner (hierarchy ≤ 2), branding, region |
| `partner_users` | User × partner, role(s), MFA / SSO policy, status |
| `partner_client_links` | Partner × tenant: relationship type, created_by (client / partner), **ownership (client / partner)**, named client contact, status, start / end, client approver |
| `ownership_transfers` | Tenant × direction, requested_by, verified_by, notice ends, status, completed_at |
| `partner_grants` | Link × module / entity / action scopes, approval delegation flags (payroll approval, filing, DSC signing), version, approved_by, approved_at |
| `partner_user_assignments` | Partner user × client link × role |
| `partner_tasks` | Partner × client × task (type, due, status, owner, SLA), linked to statutory calendar items / payroll runs |
| `partner_templates` | Partner-owned reusable templates (structure, letter, mapping), version |
| `partner_billing_accounts` | Partner × billing mode (Q3), GSTIN, payment method, consolidated invoice settings |
| `partner_commissions` | Partner × client × month: billed amount, commission basis, amount, status (accrued / approved / paid), payout ref |
| `partner_directory_listings` | Partner × services, states, languages, client-size band, fee range, verified reviews, status |
| `partner_agreements` | Partner × APX-G agreement version, accepted_by, accepted_at |

`partners*` are **platform-level** tables (not tenant data). Everything a partner does inside a client tenant is written in **that tenant** with `organization_id` + RLS and an actor type "partner user". A partner user never sees any other client's data through a tenant query. The cross-client dashboard reads only a **status feed** that each tenant publishes for linked partners (counts / statuses, no personal data).

## 5. Rules (YX-PTR)

| ID | Rule |
|---|---|
| YX-PTR-01 | A partner firm must be verified (identity, tax ids, agreement) before any client link becomes active. Suspension of a partner immediately suspends all its client access. |
| YX-PTR-02 | Tenant ownership (client-owned or partner-owned) is chosen at creation and recorded on the link (Q2). In a client-owned tenant, partner access exists only through a grant approved by a client admin, who can view, change or end it at any time; ending it removes access immediately. In a partner-owned tenant, the named client contact always keeps audit-log view, full export and the right to transfer ownership, and the partner can't remove these. |
| YX-PTR-03 | Partner users reach a client only if assigned to that client, and only within the grant's modules, entities and actions. Field classes (P02) apply as for tenant roles; Special data (medical, POSH, biometrics) is never in a partner grant. |
| YX-PTR-04 | Every partner action inside a client tenant is recorded in that client's audit log with the partner firm and user, and is visible to the client in "who accessed my data" (P08). |
| YX-PTR-05 | Payroll release, bank-file release, statutory filing and DSC signing need a client-side approval, unless the client has delegated that step to the partner in the grant (D17). Step-up MFA (P12) applies either way. |
| YX-PTR-06 | Partner users must use MFA. Partners with 10+ users must use SSO or passkeys. Partner sessions follow the P12 desk session limits. |
| YX-PTR-07 | The cross-client dashboard shows only statuses, counts and due dates from each client's partner status feed; no personal data leaves a client tenant for the dashboard. |
| YX-PTR-08 | Every partner-created tenant must have a named client contact invited at creation. Live payroll can't run until that contact has accepted, whichever ownership model is chosen. |
| YX-PTR-13 | A partner-owned → client-owned transfer completes after the agreement's notice period (never more than 30 days) and the partner can't block it; open runs are completed or handed over, and the billing account moves with ownership. Every transfer is verified and audited. |
| YX-PTR-14 | YukthiX does not run payroll or filings for clients as a service; managed payroll is delivered only by verified partners (Q4). The partner directory lists verified partners only, and ordering never depends on payment to YukthiX. |
| YX-PTR-09 | Partner templates are copied into a client, never shared live, so one client's change never affects another. |
| YX-PTR-10 | Reseller hierarchy is at most two levels. Commissions and reports roll up, but a master partner never gets client data access through a sub-partner. |
| YX-PTR-11 | Billing per client follows Q3: direct billing + referral commission, or partner-billed consolidated invoice at a partner discount. The client's YukthiX price is never above the published D18 price; commission and discount rates must pass YX-BILL-09; every commission line links to the client invoice it came from. If a partner-billed account goes unpaid, the client may switch to direct billing and is not suspended for the partner's debt. |
| YX-PTR-12 | When a link ends or ownership moves to the client, the partner keeps only its own work records (tasks, invoices, commission). Client data, documents and templates copied into the client stay with the client. |

## 6. Flows
1. **Partner sign-up:**
   1. Apply (firm details, types).
   2. Verification by YukthiX partner team (P14 console).
   3. Agreement accepted.
   4. Partner admin sets users, roles, MFA / SSO, branding.
2. **Link an existing client:**
   1. The client admin invites the partner (or the partner requests a link and the client approves).
   2. The client picks the grant (starter template per relationship type: *Operates payroll*, *Advises compliance*, *Auditor read-only*).
   3. The partner admin assigns users.
3. **Partner creates a client:**
   1. The partner creates a tenant (P14 sign-up on the client's behalf) and invites the named owner.
   2. The owner accepts, becomes the data owner and approves the grant.
   3. Setup and migration (P15), using partner templates.
4. **Monthly payroll through a bureau:**
   1. Inputs are collected (document requests, imports).
   2. The operator processes the run (M03).
   3. The client approver approves (or delegated approval).
   4. Bank file.
   5. Lock.
   6. Payslips.
   7. Statutory returns through the dashboard calendar.
5. **Month-end view:** the partner sees all clients by status, clears blockers, chases clients, and exports a status report for the firm's own records (no personal data).
6. **End a relationship:** the client (or the partner, with notice) ends the link. Access stops, open tasks are handed back to the client, and commission stops from the next billing month.

## 7. UI
- **Partner portal** (own shell, partner branding optional):
  - **Clients:** list with health, payroll status and compliance status; search.
  - **Compliance calendar:** across clients, filters by statute / state / status.
  - **Tasks:** board across clients.
  - **Requests:** document requests to clients.
  - **Templates.**
  - **Team.**
  - **Billing & commission.**
  - **Profile.**
- **Client switcher:** enters a client tenant with a persistent "Working in: Client X as Partner Y" banner.
- **Client side:** *Settings › Partners*: linked partners, grant editor, approval delegation switches, access log, end link.
- **YukthiX console (P14):** partner applications and verification, partner list, commission approval, hierarchy.

## 8. Migration & rollout
- **Wave 3** (payroll pilot), **all partner types** (Q1):
  - CA firms, payroll bureaus, resellers / referral partners and implementation partners;
  - client links and grants, cross-client dashboard and calendar, operator roles;
  - reseller hierarchy and commissions;
  - partner-created tenants and partner templates.

The exam-app agency model (ATS staffing agencies) stays separate: agencies are M10 vendors, not partners.

## 9. Acceptance tests (samples)
- A CA user assigned to Client A can't open Client B, and Client A's employee list never appears in the cross-client dashboard (YX-PTR-03, YX-PTR-07).
- A client admin ends the link and the partner user's next request to that tenant is refused (YX-PTR-02).
- A bureau operator can process a run but can't release the bank file unless the client delegated it; with delegation, step-up MFA is still asked (YX-PTR-05).
- A partner action (editing a salary) appears in the client's audit log and in the employee's "who accessed my data" (YX-PTR-04).
- A partner-created tenant can't run live payroll until the invited client contact accepts (YX-PTR-08).
- In a partner-owned tenant the client contact requests transfer; the partner can't cancel it, and after 30 days the client is owner with the full history (YX-PTR-13).
- A master partner can see a sub-partner's commission totals but can't open a client of that sub-partner (YX-PTR-10).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Partner types at launch | **CA firms + payroll bureaus in wave 3** (they drive India SMB payroll), **resellers / referral + implementation partners in wave 6**. |
| Q2 | Can a partner own a client's tenant? | **No: the client always owns its data.** The partner may create a tenant for a client, but a named client owner must accept; the partner works only through a revocable grant. |
| Q3 | Billing & partner earnings | **Partner chooses per client:** (a) **client billed directly** at $1 pricing and the partner earns a **referral commission** (% of the client's subscription, paid monthly), or (b) **partner billed** on one consolidated invoice at a **partner discount** from the $1 price and re-bills its clients (with its own service fee) — the client's YukthiX price is never raised. |
| Q4 | Managed payroll service | **YukthiX does not run payroll as a service.** Partners (bureaus / CAs) provide managed payroll using the console; YukthiX lists verified partners in a directory so clients can find one. Keeps the $1 model and avoids YukthiX taking statutory liability. |
| Q5 | Partner branding | *By principle (D15: white-label included):* partner logo / name on the partner portal and optionally on the client's employee portal login page if the client agrees. No extra charge. |
| Q6 | Approval delegation to partners | *By principle (D17):* the client decides per step in the grant (payroll approval, bank-file release, filing, DSC signing). Starter template: all steps need client-side approval. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **All partner types in wave 3:** CA / accountant firms, payroll bureaus, resellers / referral partners and implementation partners, together with the payroll pilot. This includes the reseller hierarchy, commissions and partner-created tenants. | 26 Sep 2026 |
| Q2 | **Company chooses at creation:** a tenant is either **client-owned** (starter template) or **partner-owned**, with a verified ownership-transfer process. In a partner-owned tenant the named client contact always keeps audit view, full export and the right to take ownership after at most 30 days' notice; employees always keep their own payslips and statutory documents; the employer stays the DPDP data fiduciary (YX-PTR-02, 08, 13). | 26 Sep 2026 |
| Q3 | **Partner chooses per client:** (a) direct billing at the D18 price with a monthly referral commission, or (b) a consolidated partner invoice at a partner discount, re-billed by the partner with its own service fee. The client's YukthiX price is never raised; rates must pass YX-BILL-09 (YX-PTR-11). Team action: set commission % and partner discount. | 26 Sep 2026 |
| Q4 | **No YukthiX-run payroll service.** Verified CA firms and bureaus deliver managed payroll through the console, and clients find them in an in-product **partner directory** (no paid ranking). YukthiX takes no statutory filing liability for clients (YX-PTR-14). | 26 Sep 2026 |
| Q5 | **By principle (D15, white-label included):** partner branding on the partner portal and, if the client agrees, on the client's login page; no charge. | 26 Sep 2026 |
| Q6 | **By principle (D17):** the client decides per step in the grant whether payroll approval, bank-file release, filing and DSC signing are delegated to the partner; starter template = all steps need client-side approval; step-up MFA always (YX-PTR-05). | 26 Sep 2026 |
| Q3 rates | **Deferred (27 Sep 2026):** the referral-commission percentage, partner discount, master-partner share and cap are **not yet decided**; the founder will run market research on partner commissions first. Until then YX-PTR-11 holds the structure only. Reference schedule (not adopted): PRICING-UNIT-ECONOMICS.md §4. | 27 Sep 2026 |
