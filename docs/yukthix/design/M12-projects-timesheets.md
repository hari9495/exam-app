# M12 · Projects & Timesheets

> **Status:** ✅ Decided (by principle), 26 Sep 2026. The user decided on 26 Sep 2026 to include GAP-REGISTER **B1**; the 4 design questions (§10) were settled by principle (D17 / D18) with the recommended options (§11). Validation pass 3 Shoulds added 28 Sep 2026 (§8b).
> **Covers:** GAP-REGISTER **B1** (projects & timesheets for services firms: project / task master, weekly timesheets, utilisation, project costing, client billing outside the staffing desk); spec §1.3.4 (timesheets) beyond the basic M02 §B7.
> **Builds on:**
> - M02: §B7 timesheet entry screens, approver resolver and the timesheet hours feed (§B6); day engine for available hours; Timesheet attendance mode (D1);
> - M03: cost rates (YX-PAY-42), rate-based pay (YX-PAY-24);
> - M05: expense lines tagged to a project;
> - M10: client master, contacts, client portal (Q8), invoicing, GST, e-invoicing, collections (Q7, YX-ATS-16);
> - P01 (entities, cost centres), P02 (scopes, Restricted cost data, small-group suppression), P03 (approvals), P04 (reminders), P06 (dated rates), P08 (locks), P09 (metrics), P10 (accounting export, Q7), P11 (API, webhooks).
>
> **D17:** every project, timesheet and billing policy is company-configured from a labelled starter template. **D18:** all M12 features are included in the $1 HRMS price; only e-invoicing via a GSP partner and custom one-customer connectors are add-ons.
> **Build wave:** 5.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Timesheet entry | Desk weekly grid (project / placement × task × day, billable flag, copy last week, submit week); mobile Time tab day list with "submit week" | M02 §B7 (D4) |
| Timesheet approver | Internal project → project manager; deployed contractor → client contact in the portal; account-manager fallback | M02 §B7 (D4) |
| Pay from hours | Approved hours by normal / OT / holiday feed payroll for Timesheet-mode groups and rate-based pay | M02 §B6, M03 YX-PAY-24 |
| Client invoices | GST tax invoices generated in YukthiX, numbering per entity / GSTIN, credit notes, export to Tally / Zoho; e-invoicing (IRN) via GSP partner | M10 Q7 |
| Client portal | Client contacts log in by email OTP, not a billed seat, scoped to their client | M10 Q8, YX-ATS-11 |
| Collections | Receivables ledger, ageing, dunning, client-side TDS, disputes, credit notes | M10 YX-ATS-16 |
| Accounting | Journal export to Tally, Zoho Books, CSV and Accounting API | P10 Q7 |
| Locks | Open → frozen → locked; late changes as corrections | P08 |

---

## 1. Purpose & scope
IT services, consulting, agencies, engineering and professional-services firms need to know **who worked on what, for which client, whether it is billable, what it cost and what to invoice**. M12 gives them that without a separate PSA tool, reusing the timesheet screens (M02), cost data (M03) and invoicing (M10) that already exist.

In scope:
- projects and tasks master (client, billable, budgets in hours / cost / fee);
- team allocation and capacity;
- weekly timesheets on desk and mobile (building on M02 §B7);
- approvals by project manager and, optionally, the client via the portal;
- utilisation and capacity;
- project costing from M03 cost rates plus project expenses (M05);
- **client billing for services firms**: time & material and fixed-fee milestones, reusing M10 invoicing and GST (not only the staffing desk);
- exports to accounting.

Out of scope: task boards / Gantt / issue tracking (projects' delivery work stays in Jira, Azure DevOps and similar; hours can be imported through the P11 API), revenue recognition accounting (finance system; M12 exports the data), resource-procurement / subcontractor POs.

## 2. What exists today
| Where | Relevant pieces |
|---|---|
| Exam app | No project or timesheet code; clients / invoices are designed in M10 (wave 7) on the exam-app ATS |
| Design docs | M02 §B7 `timesheets` + entry screens + approver resolver; M02 §B6 hours feed; M10 `clients`, `client_contacts`, `rate_cards`, `client_invoices` + lines, collections; M03 rate-based pay |
| Reuse | P03 approval engine and approval cards; P04 reminders; exporters (CSV / XLSX); P09 metric layer; BullMQ for invoice runs |

**Wave note:** M12 ships in wave 5, before the M10 staffing desk (wave 7). The **client master, invoice model, GST and numbering** from M10 Q7 are therefore **built in wave 5 as shared billing components** used by M12 first and by the staffing desk later (one client master, one invoice engine).

## 3. Concepts
- **Client:** the M10 client record (legal name, GSTIN per state, billing contacts, payment terms, currency). One client can buy staffing and services; both use the same client and receivables ledger.
- **Project:** a unit of work for a client or internal: code (unique per entity), name, client (blank = **internal**), legal entity, cost centre, project manager, account manager, dates, status (**draft / active / on hold / closed**), **billable** flag and **billing model** (non-billable / **time & material** / **fixed fee** / **retainer** as a fixed fee with a monthly milestone), currency (from the client), budgets: **hours**, **cost** and **fee / contract value**, alert thresholds.
- **Task:** a work item under a project (phase or activity, e.g. "Design", "Support"), with its own billable override, budget hours and optional milestone link. Company **activity codes** (e.g. meeting, development, travel) can be required on lines.
- **Allocation:** a person on a project for a date range with **% or hours per week** and a **project role** (drives the bill rate). Only allocated people can book time (company setting, YX-PRJ-02).
- **Timesheet:** one **week** per employee (M02 §B7 header), with **lines**: date, project / placement, task, activity, hours, billable, notes. Status draft → submitted → approved / partly approved / sent back → locked. Placement lines (M10) and project lines live in the same week.
- **Bill rate:** a dated **project rate card**: per project role, or per person as an override, or one project default; hourly or daily; in the project currency.
- **Cost rate:** the employee's monthly hourly cost from M03 (YX-PAY-42), **Restricted**.
- **Milestone:** for fixed-fee projects: name, amount or % of fee, due date, acceptance criteria; completed by the PM (optional client sign-off) → billable.
- **Utilisation:** billable hours ÷ **available hours** (expected working hours from the M02 day engine minus leave and holidays). **Capacity:** available hours − allocated hours, per person / team / skill, forward-looking.
- **WIP (unbilled):** approved billable hours × bill rate and completed milestones not yet invoiced.

## 4. Data model (main tables)

| Table | Key columns |
|---|---|
| `projects` | `code`, `name`, `client_id?`, `legal_entity_id`, `cost_centre_id`, `pm_employee_id`, `account_manager_employee_id?`, `start_on`, `end_on`, `status`, `billable`, `billing_model` (none / tm / fixed / retainer), `currency`, `budget_hours`, `budget_cost`, `contract_value`, `alert_thresholds` (starter 80 / 100 %), `client_approval` (none / after PM), `po_number?` |
| `project_tasks` | `project_id`, `name`, `parent_id?`, `billable?` (override), `budget_hours`, `milestone_id?`, `status` |
| `project_allocations` | `project_id`, `employee_id`, `project_role`, `from`, `to`, `percent` or `hours_per_week`, `tentative` flag |
| `project_rate_cards` | `project_id`, `project_role?`, `employee_id?`, `unit` (hour / day), `rate`, `valid_from`, `valid_to` (dated, P06) |
| `project_milestones` | `project_id`, `name`, `amount` / `percent`, `due_on`, `status` (planned / completed / accepted / invoiced), `completed_by`, `client_accepted_by?`, `invoice_line_id?` |
| `timesheets` (M02, extended) | employee, week start, status, submitted_at, locked |
| `timesheet_lines` | `timesheet_id`, `date`, `project_id?` / `placement_id?`, `task_id?`, `activity_code?`, `hours`, `billable`, `notes`, `approval_status` (pending / approved / rejected), `approved_by`, `approved_hours`, `reduction_reason`, `client_approved_by?`, `rate_category` (normal / OT / holiday), `invoice_line_id?`, `adjusts_line_id?` |
| `project_cost_postings` | `project_id`, `month`, `employee_id`, `hours`, `cost_rate_ref` (M03), `amount`, `provisional` flag; expenses from M05 `expense_lines.project_id` |
| `client_invoices` / `client_invoice_lines` (M10, shared) | + `project_id?`, `milestone_id?`, `source` (timesheet / milestone / retainer / expense rebill / staffing) |
| `project_snapshots` | month-end budget, burn, WIP, billed, cost, margin per project (P09 source) |

All tables carry `organization_id` + RLS (P01). Cost rates and cost postings are **Restricted** (payroll / finance scope); bill rates and invoices are **Confidential** (PM, account manager, finance in scope).

## 5. Rules (YX-PRJ)

| ID | Rule |
|---|---|
| YX-PRJ-01 | A project code is unique per legal entity; a project needs a PM, an entity and a cost centre; a billable project needs a client and a billing model; a closed project accepts no new time or costs (late entries go through YX-PRJ-05). |
| YX-PRJ-02 | Time can be booked only to **active** projects and tasks, within the project dates, by people **allocated** on that date (company setting: block, or allow with PM approval; starter **block**); internal non-project codes (training, bench, admin) are always available per company list. |
| YX-PRJ-03 | A timesheet is one week per employee; per-day hours above the company daily maximum (starter: warn above the shift's expected hours, block above 24) are refused; notes are required where the project or activity requires them; billable defaults from the task, then the project; a submitted week cannot be edited until it is sent back. Placement lines and project lines share the week and the M02 §B7 screens. |
| YX-PRJ-04 | Each line is approved by the resolver of its project (starter: **PM**; the PM's manager when the PM is the submitter; the account manager when the PM is absent past the SLA) and, where the project has **client approval**, by the client contact in the portal **after** the PM; placement lines keep the M02 §B7 resolver. Approvers may approve, reject or reduce hours with a reason (shown to the employee); client contacts see only their client's projects and the lines billed to them. |
| YX-PRJ-05 | Approved lines are immutable; a correction is an **adjustment line** in an open week that references the original, approved like any line. Timesheet periods freeze and lock with the P08 attendance / payroll lock; invoiced lines can be corrected only through a credit note (M10) plus an adjustment line. |
| YX-PRJ-06 | **Utilisation** = approved billable hours ÷ available hours (M02 expected hours minus leave and holidays); **capacity** = available − allocated hours; both are P09 metrics per person, team, project role and skill, with small-group suppression for non-HR viewers (P02). The utilisation target is a company setting per designation (starter 75 % for billable roles). |
| YX-PRJ-07 | **Project cost** = Σ approved hours × the employee's cost rate for that month (M03 YX-PAY-42; provisional until the month's payroll is paid, then final) + project-tagged approved expenses (M05) + other cost lines entered by finance; budget burn alerts fire at the project's thresholds (starter 80 % and 100 % of hours, cost and fee) to the PM and account manager. |
| YX-PRJ-08 | Individual cost rates are visible only to payroll / finance scope; PMs and account managers see project cost, margin and burn as totals, and a cost figure that would reveal one person's rate (one person on the project or task in that month) is suppressed for them. |
| YX-PRJ-09 | **Time & material billing:** an invoice line = approved (and, where required, client-approved) billable hours × the bill rate valid on the work date (person override > project role > project default), grouped as the project's invoice layout says (by person, role or task); unapproved, non-billable or already-invoiced hours are never billed; the **WIP** view lists everything billable not yet invoiced. |
| YX-PRJ-10 | **Fixed-fee billing:** milestone amounts must add up to the contract value (warning when not); a milestone becomes billable only when completed by the PM (and accepted by the client where the project needs it); a retainer bills its monthly amount on the company's billing day; effort on fixed-fee projects is costed (YX-PRJ-07) but never billed per hour. |
| YX-PRJ-11 | Invoices for services projects are produced by the **shared M10 invoice engine**: same numbering per entity / GSTIN, GST (place of supply from client GSTIN), credit notes, PO number, e-invoicing via the GSP add-on, receivables and collections (YX-ATS-16); an invoice is created as a draft from WIP, approved (P03, starter: account manager → finance) and then issued; issued invoices are never edited. |
| YX-PRJ-12 | **Accounting export (P10 Q7):** issued invoices, receipts and credit notes with the **project dimension**; a monthly **project cost journal** (reclassifying payroll cost from cost centre to project, from `project_cost_postings`); WIP and fixed-fee progress as a report for finance's revenue recognition. Exports are idempotent per period and version. |
| YX-PRJ-13 | Payroll reads project hours **only** for employees whose attendance mode is **Timesheet** (M02 D1) or whose pay basis is rate-based (M03 YX-PAY-24), through the unchanged M02 §B6 feed; for Punch and Assumed-present employees project hours drive costing and billing only, and a difference between timesheet hours and attendance worked hours is flagged to the PM, never auto-corrected. |
| YX-PRJ-14 | Every project, timesheet and billing policy (allocation rule, daily maximum, notes, approval chain, client approval, utilisation targets, alert thresholds, invoice grouping, billing day) is a company setting from a labelled starter template (D17); the company can override per project where the setting allows. |

## 6. Flows
1. **Set up a project:** PM or PMO creates the project (client, billing model, budgets, dates) → tasks and milestones → allocations (capacity view shows who is free) → rate card → approval if the company requires it (P03, starter off) → active.
2. **Weekly timesheet:** employee fills the week (desk grid or mobile day list; copy last week; allocations pre-populate rows) → submit (P04 reminder Friday; missing-week nudge Monday) → PM approves / reduces / rejects lines on the approval card → client approves in the portal where required → locked with the period.
3. **Costing:** nightly: provisional cost postings from approved hours × provisional cost rate; on `payroll.run.paid`, postings for that month become final; M05 approved project expenses post as they are approved; burn alerts.
4. **Billing (T&M):** on the billing day (or on demand) the account manager opens the **billing workbench** → WIP per project → create draft invoices → approve → issue (M10 engine, GST, e-invoice via GSP add-on) → sent to client billing contacts and shown in the portal → receipts and collections in M10.
5. **Billing (fixed fee):** PM marks a milestone complete → optional client acceptance in the portal → billable → draft invoice → approve → issue.
6. **Month end:** project snapshots (P09) → project cost journal and invoice export (P10) → profitability report per project, client and PM.

**Events emitted:** `project.created`, `project.status.changed`, `project.budget.threshold`, `project.milestone.completed`, `timesheet.submitted`, `timesheet.approved`, `timesheet.rejected`, `timesheet.missing` (scheduler); invoices emit M10's `ats.invoice.issued` with `source = project`. **Consumed:** `payroll.run.paid` (final cost rates), `expense.claim.approved` (project expenses), `employment.exited` (end allocations, reassign PM / approvals, YX-LC-14). To be added to APX-B / APX-A by their owners.

## 7. UI
- **Projects** list (T2) with status, client, PM, burn bars, utilisation; **project workspace** (T3): Overview (budget vs actual hours / cost / fee, margin for finance), Team & allocations, Tasks & milestones, Timesheets, Billing (WIP, invoices), Expenses.
- **Timesheet week grid** (M02 §B7) with project / task pickers limited to allocations, and totals vs expected hours.
- **Approvals:** P03 approval cards grouped by project and week; bulk approve for lines within allocation.
- **Capacity & utilisation board:** people × weeks heatmap (allocated vs available), filter by skill / role / location; utilisation vs target per person and team.
- **Billing workbench:** WIP by client / project, "Create invoices", draft review, issue; shares the M10 invoice screens.
- **Client portal (T9):** projects, timesheets to approve, milestones to accept, invoices.
- **Mobile:** Time tab timesheets (day list, submit week), PM approvals in Requests (M04 §3.1).
- Screen ids to be added to APX-D §2 and settings to APX-D §3 / APX-E by their owners.

## 8. Migration & rollout
- Wave 5: projects, tasks, allocations, timesheets (extending M02 §B7), approvals incl. client portal approval, utilisation / capacity, costing, T&M and fixed-fee billing on the shared M10 invoice engine, accounting export.
- Import via P15 templates: clients, projects, tasks, allocations, rate cards, open milestones and unbilled approved hours (as opening WIP).
- Existing M02 §B7 timesheet rows become `timesheet_lines` of the same model (no data move).
- A **starter template** for services firms: activity codes, internal codes (bench, training, admin), approval chain, 75 % utilisation target, 80 / 100 % burn alerts.

## 8b. Validation pass 3 additions (founder decisions 28 Sep 2026)

Validation pass 3 Should items for projects and timesheets ([SHOULD-DECISIONS](research/validation-pass-3/SHOULD-DECISIONS.md)).

| ID | What it does | Rule | Wave |
|---|---|---|---|
| J19 | Timesheet correction after invoice | YX-PRJ-15 | 5 |
| R20 | E-invoice 30-day guard on project invoices | YX-PRJ-16 | 5 |
| V18 | Internal bench and resource requests (IT services) | YX-PRJ-17 | 5 |

| ID | Rule |
|---|---|
| YX-PRJ-15 | **J19.** A correction to approved time that is already invoiced creates a **credit note** (or supplementary invoice) linked to the original invoice. By company policy it is linked to a pay recovery in M03 or to none; project margin is restated for the affected period and the change is audited (P08 period locks respected). |
| YX-PRJ-16 | **R20.** Same guard as M10: for an entity at or above the e-invoice threshold (AATO in P07; **verify the current threshold**), a project invoice dated more than 30 days ago cannot be sent for IRN: warning from day 25, blocked after day 30. |
| YX-PRJ-17 | **V18.** Each employee has a bench status (allocated / partly allocated / bench) derived from allocations, with bench ageing in days. A PM raises a resource request (skills, level, dates, % allocation); the system matches on skills from the M06 skills library (YX-PERF-20) and availability, ranks bench people first, and the resource manager confirms the allocation. |

**Acceptance tests (validation pass 3):**

- J19: an invoiced timesheet is corrected down by 8 hours; a credit note linked to the invoice is created, that month's margin is restated, and with the policy on an M03 recovery line appears.
- J19: with the policy set to none, the correction creates the credit note but no pay recovery.
- R20: a 31-day-old project invoice for an entity above the threshold is blocked from IRN submission.
- V18: an unallocated employee shows bench status with ageing; a resource request for SQL at 100% lists her first when her skill is confirmed and she is free on the dates.
- V18: a person allocated 100% on the requested dates is not shown as available.

## 9. Acceptance tests (samples)
- Priya is allocated to ACME-Website from 1 Oct; she can't book time to ACME-Mobile (not allocated) and the grid offers only her allocated projects plus internal codes (YX-PRJ-02).
- Her submitted week of 42 h is approved by the PM with 2 h reduced ("duplicate stand-up entry"); she sees the reason; the approved 40 h are locked and a later fix appears as an adjustment line (YX-PRJ-04/05).
- ACME-Website (T&M) has 120 approved billable hours at ₹2,000 (role Senior Developer) and 10 hours awaiting client approval: the draft invoice bills ₹2,40,000 + GST only; the 10 hours stay in WIP until the client approves in the portal (YX-PRJ-09/11).
- A fixed-fee project of ₹10 L with milestones 30 / 40 / 30 % bills ₹3 L only after milestone 1 is completed and accepted; logged hours raise cost but create no invoice lines (YX-PRJ-10).
- Project cost for October shows ₹1,85,000 provisional; after October payroll is paid it is recomputed from final cost rates; the PM sees totals only, and a one-person task's cost is hidden from the PM (YX-PRJ-07/08).
- Rahul (Punch mode, monthly CTC) books 50 project hours in a week where attendance shows 40 worked hours: pay is unchanged and the PM sees a mismatch flag (YX-PRJ-13).
- Utilisation for the Design team in October = 1,120 billable ÷ 1,480 available hours = 75.7 %; a team of 3 is suppressed for a non-HR viewer where P02 says so (YX-PRJ-06).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | One timesheet model for M02 and M12, or a separate project timesheet? | **One model.** M02 §B7 screens, approver resolver and payroll feed stay; M12 adds projects, tasks, allocations, activity codes and billing fields to the same `timesheets` / `timesheet_lines`. Placement and project lines share one week, so employees submit once. |
| Q2 | Client billing for services firms: reuse M10 or build separately? | **Reuse M10's invoice engine as a shared billing component**, built in wave 5 (client master, invoice, GST, numbering, credit notes, collections), used by M12 first and the staffing desk later. Billing models: **time & material, fixed-fee milestones and retainer**; e-invoicing via the GSP add-on (D18). |
| Q3 | Where do cost rates come from? | **From M03**: monthly employer cost ÷ standard hours per employee (provisional for open months, final after payroll), **Restricted**; PMs see project totals only, with single-person suppression. A company may instead use **standard cost rates per designation / grade** (company setting). |
| Q4 | Who approves timesheets, and can clients approve? | **Per project, company starter template:** PM approves (PM's manager when the PM is the submitter; account manager after SLA); **client approval via the portal after the PM** is a per-project option (off by default); placement lines keep the M02 §B7 resolver. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| B1 | **Gap-register extension (user decision 26 Sep 2026): Projects & timesheets (new M12), wave 5.** User decision 26 Sep 2026 to include B1; all design questions decided by principle (D17 / D18) — recommended options adopted. Projects & tasks master (client, billable, budgets in hours / cost / fee), allocations & capacity, weekly timesheets on desk and mobile extending M02 §B7, PM and client-portal approvals, utilisation, project costing from M03 cost rates + M05 expenses, client billing for services firms (T&M, fixed-fee milestones, retainer) on the shared M10 invoice engine with GST, accounting export with project dimension. Rules YX-PRJ-01–14. | 26 Sep 2026 |
| Q1 | **One timesheet model** shared with M02 §B7 (by principle, user decision 26 Sep 2026 to include B1 — recommended option adopted). | 26 Sep 2026 |
| Q2 | **Shared M10 invoice engine**, built in wave 5 as a common billing component; T&M, fixed-fee milestones and retainer; e-invoicing via GSP as a third-party add-on (D18) (by principle, user decision 26 Sep 2026 to include B1 — recommended option adopted). | 26 Sep 2026 |
| Q3 | **Cost rates from M03** (employer cost ÷ standard hours; provisional → final), Restricted, PM sees totals with single-person suppression; standard cost rates per designation / grade as a company option (D17) (by principle, user decision 26 Sep 2026 to include B1 — recommended option adopted). | 26 Sep 2026 |
| Q4 | **Approval per project from a starter template:** PM (fallbacks: PM's manager, account manager after SLA); optional client approval in the portal after the PM (starter off); placement lines keep M02 §B7 (by principle, user decision 26 Sep 2026 to include B1 — recommended option adopted). | 26 Sep 2026 |
| J19 | Validation pass 3 Should (J19), founder decision 28 Sep 2026: timesheet correction after invoice creates a linked credit note, linked to pay recovery or none by policy, margin restated. Rule YX-PRJ-15. | 28 Sep 2026 |
| R20 | Validation pass 3 Should (R20), founder decision 28 Sep 2026: e-invoice 30-day reporting guard on project invoices (shared invoice engine with M10). Rule YX-PRJ-16. | 28 Sep 2026 |
| V18 | Validation pass 3 Should (V18), founder decision 28 Sep 2026: internal bench status with ageing and resource requests matched on M06 skills (YX-PERF-20) and availability. Rule YX-PRJ-17. | 28 Sep 2026 |
