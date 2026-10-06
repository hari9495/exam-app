# P09 · Metric Layer & Analytics Platform

> **Status:** ✅ Decided, 25 Sep 2026. All 8 questions answered (§11). **Extended 26 Sep 2026 (gap register, user decision):** DEI dashboard template and pay-gap metric (GAP C3), tenant-health metrics feed for customer success (C8), workforce-planning / attrition-risk metric references (B16) and AI-quality metrics (B13) — §4.9, YX-MET-14–17, §11 C3 / C8 / B16 / B13. **Validation pass 3 Must (S1), founder decision 28 Sep 2026:** YukthiX's own **product analytics** on the metric layer (usage event stream, funnels, time to first value, cohort retention, feature adoption) in a separate `product_analytics` schema with no personal or HR data — §4.10, YX-MET-19–21, §11 S1; business use in [P20](P20-growth-trial-customer-operations.md). **Validation pass 3 Should (R6/R7/T5), founder decision 28 Sep 2026:** SEBI BRSR workforce pack and Companies Act Board's-report pack with suppression and sign-off — §4.11, YX-MET-23–24, §11 R6 / R7 / T5; wave 5.
> **Covers:** spec §1.4 (Analytics product: report builder, role dashboards, scheduled reports & exports, domains 1.4.4–1.4.8), [11-analytics.md](../reference/frappe-hrms-functional-spec/11-analytics.md) §5–§8 (metric dictionary, architecture, 6 open questions), UI brief principle 2 ("one number, everywhere"), customer-built dashboards (discussed after the OpenPanel review: built in-house).
> **Builds on:** P01 (tenancy, org dimensions), P02 (scopes, field classes, small-group suppression), P04 (scheduled delivery), P06 (effective-dated history), P07 (statutory versions), P08 (audit of exports).

---

## 1. Purpose & scope
One analytics platform for all four products (Proctoring, ATS, HRMS, Analytics):
1. **Metric layer:** every metric is defined once (formula, grain, dimensions, sensitivity) and used everywhere: widgets, reports, exports, mobile cards (wave 6), AI answers.
2. **History for "as on date":** daily snapshots built from P06 dated facts.
3. **Delivery:** role dashboards, **customer-built dashboards**, metric explorer, report builder, schedules and exports.
4. **Security:** the same tenant RLS + P02 visibility + field classes + small-group suppression as the app.

**Out of scope:** the operational screens' own lists (they use the same metric definitions for counts, UI brief principle 2); statutory registers remain reports owned by modules 03/04.

---

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | Keep / change |
|---|---|---|
| Assessment analytics | `item-analytics` (difficulty, discrimination, distractors, answer-key change), integrity dashboards | **Keep**; register its measures as metrics |
| Hiring analytics | `pipeline-analytics` (funnel, time-to-hire, sources), AI funnel narrative | **Keep**; re-express as metrics |
| Exports | `reports/exporters` CSV / XLSX (`exceljs`) / PDF | **Reuse** for all exports |
| Scheduled | `scheduled-reports` weekly digest | Generalise into subscriptions (§4.6) |
| Dashboard UI | ui-v2 `StatCard`, `IconStatCard`, `StatsHero`, `Gauge`, `AnalyticsTiles`, `DashboardLists`, Recharts | **Reuse** for widgets |
| Report builder / metric layer / snapshots | None | **New** |

---

## 3. Concepts

| Term | Meaning |
|---|---|
| **Metric** | A governed measure: key, name, plain definition, formula, unit, grain (per day / month / event), allowed dimensions, sensitivity, owner, version. E.g. `workforce.attrition_rate` |
| **Dimension** | A way to slice: legal entity, location, department (tree), designation, grade, employment type, manager (tree), gender, age band, tenure band, cost centre, source, job, period |
| **Snapshot** | A daily fact table built from P06 history (e.g. one row per employee per day with their assignment and status), so "headcount on 1 Apr" is a simple query |
| **Widget** | A metric + dimensions + period + chart type + filters, placed on a dashboard |
| **Dashboard** | A grid of widgets with dashboard-level filters; **templates** (shipped) or **custom** (built by customers) |
| **Report** | A tabular result from the report builder (record-level columns and/or metrics), saved and shareable |
| **Subscription** | A schedule that delivers a dashboard/report to recipients (P04 channels) |

---

## 4. Design

### 4.1 Metric layer (semantic layer)
- Metrics are defined **in code** (reviewed and tested), with a catalogue screen for users. Tenants can add **calculated metrics** from existing ones (Q5). They cannot redefine governed ones.
- A query planner compiles a request (metrics × dimensions × filters × period) to SQL on the snapshot and fact tables.
  - It applies **tenant RLS** (P01) and the **P02 visibility filter** (scope of the viewer).
  - It applies **field-class rules**: Confidential metrics such as salary cost need the matching permission.
  - It applies **small-group suppression** (Q2) for Confidential/Special breakdowns.
  - **Anonymous survey results** (M09) apply the minimum group size to **every** viewer, including HR/Payroll Admins: nobody has individual-level access to anonymous responses. Teams below the minimum roll up into their parent group.
- Every result carries its **definition, scope and freshness** ("Workfox Pvt Ltd · FY 2026-27 · data as of today 02:00"). This addresses U96/U97 from the analytics reference.
- Metric **tests**: golden datasets per metric; a metric version changes only with a changelog.
- **Metric dictionary v1** = 11-analytics §5 (workforce, time, recruitment, payroll & compliance, assessment, staffing, performance & engagement), with definitions confirmed by Q1 and Q3. **Extension** (expenses, learning, helpdesk & cases, engage, assessment operations, approvals, platform, finance provisions, compensation and lifecycle metrics): [APX-C](APX-C-reports-metrics.md) §2–§4.

### 4.2 History & snapshots
- **Daily jobs** (per tenant, off-peak, BullMQ) build:
  - `snap_employee_day`: employee, date, entity, location, department, designation, grade, manager, type, status (active / notice / exited), tenure band, age band;
  - monthly aggregates for heavy metrics (payroll cost by component and dimension, attendance %, leave usage);
  - `snap_person_day` (Validation pass 3 Must follow-up, 28 Sep 2026): person, date, active workforce roles that day (employee, contract worker, consultant, placement; same role set as APX-C `workforce.total_persons`), primary entity / location; the source of the **total-workforce headcount**, which counts **distinct persons** (P01 YX-ORG-26), so a person holding two roles on one day counts once (YX-MET-22).
- Built from P06 dated facts, so **back-dated corrections rebuild the affected snapshot days** (incremental: the change's effective date → today).
- Operational counts ("pending approvals") use live queries; trends use snapshots.

### 4.3 Storage & performance (Q6)
- Postgres: separate **analytics schema** with snapshot and aggregate tables, the same RLS, and indexes / partitions by tenant and month; heavy queries run as background **prepared results** with a notification when ready.
- A read replica for analytics queries when load requires it.
- A column store (e.g. ClickHouse) only if/when tenant sizes demand it (Q6).

### 4.4 Dashboards: templates and **custom dashboards**
- **Role templates** shipped: Executive, HR, Payroll & Finance, Recruiter (existing), Department head, Manager, Proctoring admin, plus Compliance owner, L&D admin, Helpdesk lead, Ethics officer / IC (counts only), Staffing head, Finance – expenses, System Admin ops and employee "me" cards ([APX-C](APX-C-reports-metrics.md) §5). ≤ 8 widgets each (UI brief).
- **Custom dashboards** (Q4): users with `analytics.dashboard.build`:
  - **clone a template or start blank**;
  - add widget → pick **metric** → pick dimension(s) → period and comparison (vs last period / last year) → chart type (number, trend, bar, stacked, table, funnel, gauge);
  - arrange and resize on a **drag-and-drop grid** (react-grid-layout, MIT);
  - dashboard-level filters (entity, location, department, period);
  - share with roles or people (**viewers still see only data their own scope allows**);
  - set as a role's home dashboard.
- Every widget offers **drill-down** into records (respecting P02), "explain" (the definition), export and add-to-subscription.
- Charts: Recharts (in use); Apache ECharts only if a needed chart type is missing.

### 4.5 Metric explorer & report builder
- **Explorer:** any metric × any allowed dimension × period, as trend / breakdown / table, saved as a widget.
- **Report builder:** start from an entity (employees, leave, attendance, payroll lines, claims, candidates…) with joins provided by the metric layer's relationships:
  - choose columns (field classes enforced), filters, group-by with subtotals, calculated columns, sort, chart toggle;
  - save, share, schedule.
- Record-level reports obey the viewer's scope; exports are audited (P08).
- **Report library** grouped by question ("Who is leaving?", "What does payroll cost?"), with search and favourites; statutory registers in a Compliance section. The standard reports shipped (name, owner, wave, audience, sensitivity, format, as-on / period) are enumerated in [APX-C](APX-C-reports-metrics.md) §1, with the month-end provisions report in APX-C §3.2 (YX-MET-13).

### 4.6 Schedules & exports (Q7)
- A **Schedule** action on any dashboard or report: daily / weekday / weekly / monthly; formats XLSX / CSV / PDF (dashboard snapshot); **send only if data**; recipients (users, or roles).
- Delivery via P04 channels: **email attachment only for content without Confidential/Special data**, otherwise a secure login link; in-app link; WhatsApp **link only** (P04 Q6, Q7).
- Runs **as the recipient's permissions** (each recipient receives only what they may see), not the creator's.
- Exports use the exam app's exporters; all are audited (P08).

### 4.7 AI "ask analytics" (Q8)
A natural-language question is answered **only by calling governed metrics** through the same planner (with the same permissions). It shows the metric definition and filters used, plus a chart; it never runs free SQL. It builds on the exam app's AI layer and metering. The monthly leadership digest can include an AI narrative.

### 4.8 Mobile
**Deferred to wave 6** (M04 Q5: mobile team analytics deferred; P09 dashboards on desk). Launch = desk dashboards only. When built: executive/manager cards (headcount, attrition, cost, open positions, today's attendance) on the mobile Home / Me; tapping opens a simple drill list. No builders on mobile.

### 4.9 Gap-register extensions (26 Sep 2026)
All four are included in the price (D18); AI features consume AI credits (add-on).

**A. DEI dashboard template (GAP C3, wave 5).** A shipped role template **"Diversity, equity & inclusion"** (≤ 8 widgets), labelled "YukthiX starter — edit for your company" (D17); the company switches it on and chooses which dimensions to show.
- **Workforce distributions:** gender, age band, disability (self-declared, Special class), location / state, with breakdowns by level (grade band), department and employment type; trend vs last year.
- **Hiring-funnel diversity:** applicants → shortlisted → interviewed → offered → joined by gender and age band, per job family / source (M10 snapshots `snap_pipeline_day`); stage **selection-rate ratio** per group (4/5ths rule) shared with the assessment adverse-impact metrics of A13 (T02 / T05).
- **Movement:** promotions, exits (voluntary / involuntary) and rating distribution (M06) by gender.
- **Pay-gap metric** `comp.gender_pay_gap` (new, Confidential): unadjusted **median and mean** gap in fixed annual CTC (M03 compensation, P06 as-on date), and an **adjusted** gap within the same grade × location × tenure band; `comp.pay_equity_flags` = count of employees outside ±X % of the group median (company sets X, starter 10 %). Reads the P01 grade pay ranges.
- **Data sources and consent:** diversity attributes are **voluntary self-identification** (employees in Me › Profile, candidates on a separate optional form); "prefer not to say" is a counted value; candidate self-ID is stored apart from the application and **never shown to recruiters, interviewers or hiring managers** (only aggregated here).
- **Suppression:** every DEI breakdown applies the small-group threshold (YX-MET-04) **to every viewer, HR included**, for disability and for any gender / age cell (YX-MET-14); cells below the threshold roll up into "other / combined".

**B. Tenant-health metrics feed (GAP C8, before public launch).** A **platform metric domain** `platform.tenant_health.*` computed per tenant each night from usage metadata only: weekly / monthly active users ÷ billable users, modules and features used (events seen per module), setup completeness (APX-E readiness score), payroll runs completed on time, mobile adoption, open / reopened support tickets and ageing (P14 support), NPS / CSAT responses (in-app survey to admins), integration health failures, API usage, AI credits used vs bought. Feeds P14 `tenant_health` and the customer-success console (P14 §6 flow 6, YX-CONSOLE-05). **No HR record data, names or Confidential / Special values** leave the tenant: the feed carries counts, rates and IDs of YukthiX staff-visible objects only (YX-MET-15). Tenant admins see the same scores in Settings › Billing & Account (8.2 usage).

**C. Workforce planning & attrition-risk metrics (GAP B16, wave 6).** The owning docs define the features (M10 headcount plan and scenarios, M01 position management, M06 career paths / IDPs, P10 attrition-risk model); P09 registers their measures in the metric dictionary so they are governed like any other:
- `workforce.planned_headcount`, `workforce.plan_variance` (actual vs plan by department / month), `workforce.scenario_cost` (cost of a what-if plan from M03 compensation), `position.vacancy_rate`, `position.time_vacant`, `career.idp_coverage` (% employees with an active IDP), `career.internal_fill_rate`, `attrition.risk_band_count` (employees per risk band by department).
- Individual **attrition-risk scores** are Confidential, visible only to roles holding the `analytics.attrition_risk.view` grant (starter: HR Admin; not managers by default), always shown with their top contributing factors and model version; managers and department heads see **band counts** for their scope with suppression; scores are never exported in bulk to non-HR recipients (YX-MET-16).

**D. AI-quality metrics (GAP B13, wave 5).** The AI governance programme (P10 AI governance, B13) reports through registered metrics, per AI feature × model / prompt version:
- `ai.eval.score` (accuracy on the feature's eval set: OCR field accuracy, helpdesk RAG answer correctness and citation rate, AI-interview score agreement with human raters, LLM-likeness precision / recall), `ai.drift.index` (distribution shift of inputs / outputs vs the release baseline), `ai.bias.impact_ratio` (outcome ratio across protected groups where data exists; same 4/5ths logic as §4.9 A), `ai.human_override_rate`, `ai.answer_feedback` (thumbs up / down rate), `ai.latency_p95`, `ai.credits_used`.
- **Two views:** the tenant's own AI features (Settings › 7.6 AI and a "AI quality" dashboard template for System Admins) and the **YukthiX AI governance console** (platform staff; aggregate across tenants from eval runs and anonymised counters only, no tenant content).
- A model / prompt version is promoted only when its eval metrics meet the thresholds recorded in the P10 model registry (YX-MET-17).

### 4.10 Product analytics (validation pass 3, S1, before public launch)
YukthiX needs to see **where the product loses people** (the tenant-health feed in §4.9 B only says *which* tenant is at risk). We build this ourselves on the metric layer (no third-party analytics tool); it is included in the price (D18) and used by the growth, product and CS teams (P20).
- **Usage event stream.** The app emits a small, registered set of events: `feature_used`, `screen_viewed`, `step_completed` (setup-hub / quick-start step, APX-E), `first_value_reached`, `product_switched_on`, `trial_extended`, `help_opened`. Each event carries only: event key, time (to the minute), **product** (HR / Hire / Assess / Analytics), **module and screen ID** (APX-D), **tenant pseudonym**, **role template** (e.g. HR Admin, recruiter; never a custom role name), **pseudonymous user id** (keyed hash of the user id with a platform secret, rotated yearly; not reversible by analysts), app surface (desk / mobile / API), locale and tenant size band. **Never** names, emails, phone numbers, employee or candidate ids, record content, free text, amounts, search terms or any HR data (YX-MET-19).
- **Event registry.** Events are registered in code like metrics (key, allowed properties, owner); a CI check fails the build if code emits an unregistered event or property. Events are sent server-side through the platform, not by browser trackers or third-party scripts.
- **Governed product metrics** (platform domain `product.*`, registered like any other metric, YX-MET-21):
  | Metric | Definition | Grain |
  |---|---|---|
  | `product.signups` | New tenants that verified email / mobile, per product chosen | Day |
  | `product.funnel_conversion` | Share of tenants moving between the funnel stages **sign-up → first value → activated → paid**, per product, cohort and size band | Week / month |
  | `product.time_to_first_value` | Median and p75 time from sign-up to the product's first-value event: **HR** first payroll (payslip) preview, **Assess** first test invite sent, **Hire** first job posted to the careers page | Cohort |
  | `product.activation_rate` | Share of trial tenants that reach the product's activation definition within 14 days (P20 §3: e.g. HR = employees imported + first payslip preview + a second admin invited) | Cohort |
  | `product.trial_conversion_rate` | Trials that switch on paid use ÷ trials ended, per product (billing starts at go-live, YX-BILL-12) | Month |
  | `product.cohort_retention` | Share of a sign-up-month cohort with weekly active admins (and paid status) in week / month *n* | Cohort × period |
  | `product.feature_adoption` | Share of active tenants using a module / feature at least once in the period, per product and size band | Month |
  | `product.quickstart_completion` | Share of trials completing each quick-start step, and drop-off per step | Cohort |
- **Storage.** A separate **`product_analytics` schema** (platform tables, not tenant tables): raw events kept **13 months**, then deleted; daily aggregates by tenant pseudonym and product kept for trend lines without user ids. It is **not joinable** to the tenant schemas: the tenant pseudonym maps to a tenant only through a lookup table readable by the CS role for accounts it owns (P14 YX-CONSOLE-05), and the user pseudonym maps to nobody.
- **Access.** Only YukthiX staff with the **product analytics** console role (P14 YX-CONSOLE-08); tenants do not see this schema (they see their own usage and health in Settings › Billing & Account, §4.9 B).
- **Opt-out.** A tenant's System Admin can switch off **non-essential analytics** in Settings › Billing & Account; the platform then drops these events for that tenant at the source. Operational signals the service needs to run (billing meters, security logs, the §4.9 B health feed, setup-hub progress) are not affected. The purpose is covered by the privacy policy (APX-G G-05, platform telemetry).
- **Not here:** feature flags, percentage rollout and kill switches stay in the P13 brief (#7); A/B testing is Later (validation pass 3, S19).

### 4.11 Statutory and ESG disclosure packs (validation pass 3 Should R6 / R7 / T5, wave 5)
Two year-end packs built only from registered metrics (YX-MET-13), shown in the report library's **Compliance** section ([APX-C](APX-C-reports-metrics.md) §1.15 RPT-ESG-01…03, metrics §2.9). Both use the financial year (1 Apr – 31 Mar) and the legal entity as the reporting unit, with the current and previous year side by side.

**A. SEBI BRSR workforce pack (Principle 3 and Principle 5).** For listed companies (top 1,000 by market cap file every year; BRSR Core assurance and value-chain disclosure phase in from FY 2025-26):
- **Employees and workers** by gender (male / female / transgender / other) × **permanent / other than permanent**, as on 31 Mar (`esg.headcount_by_category`); "employee" vs "worker" comes from the employment-type category in P01, and contract workers from M13 count as "other than permanent workers". **Differently-abled** employees and workers in the same grid (`esg.differently_abled_count`, self-declared, Special).
- **Turnover rate** for permanent employees and workers by gender, for the last three years (`esg.turnover_rate`).
- **Benefits coverage %:** PF, gratuity, ESI, health insurance, accident insurance, maternity, paternity and day care, per category and gender (`esg.benefit_coverage_pct`).
- **Parental leave:** return-to-work rate and 12-month retention rate by gender (`esg.parental_leave_return_rate`, `esg.parental_leave_retention_rate`).
- **Well-being spend** as % of total revenue (`esg.wellbeing_spend_pct_revenue`; revenue is entered by Finance for the year).
- **Wages:** median remuneration by gender for board / KMP / employees / workers (`esg.median_wage_by_gender`) and **gross wages paid to females as % of total wages** (BRSR Core, `esg.female_gross_wage_share`), from M03 payroll results.
- **Complaints:** POSH (received / resolved / pending, from `cases.posh_counts`) and other workforce grievances by type (M08, counts only).
- **Union membership** % by category and gender (`esg.union_membership_pct`, from the union field on the employee record).
- **Safety:** LTIFR per million person-hours worked, fatalities and recordable injuries for employees and workers (`esg.ltifr`, from the M08 accident log and M02 hours).
- **Training hours** per employee by category and gender (`learning.hours_per_employee`), and share given health-and-safety and skill-upgrade training.
- **Export:** XLSX in the BRSR section / question layout (Section A employees, Section C Principles 3 and 5), plus a machine-readable file for the stock-exchange filing (**XBRL format: verify against the current SEBI / NSE-BSE taxonomy before build**). Each figure carries its metric key and version so the assurance provider can trace it.

**B. Companies Act Board's-report pack.** For every company's annual Board's report:
- **POSH:** complaints received, disposed of and pending for more than 90 days in the year (`cases.posh_counts`), per company.
- **Maternity Benefit Act statement:** a draft compliance statement filled from M02 / M03 data (maternity leave granted and paid, crèche check at 50+ employees, no dismissal during maternity leave), with any exceptions listed for HR to resolve before sign-off.
- **Headcount by gender** as on the last day of the year: male, female and **transgender** (`esg.headcount_by_category`; Companies (Accounts) Second Amendment Rules 2025, in force 14 Jul 2025 — **verify rule date**). This needs the P01 gender list to include transgender; "prefer not to say" and unknown are shown as a separate count, never guessed.

**Suppression.** Every breakdown **below** the legal-entity totals (department, location, grade) follows the DEI rule: the small-group threshold applies to every viewer, HR included (YX-MET-04 / YX-MET-14). The entity totals the law asks for are shown in full only to the pack's preparer and approvers; a cell below the threshold is flagged "small group — required by law, check wording before publishing" and is never sent in a subscription or to other roles.

**Sign-off.** Preparer (HR / Compliance owner) → reviewer (CFO or Company Secretary) → approve. On approval the pack is **frozen** as a numbered version with its metric versions and data cut-off date; later back-dated changes do not change it (a new version must be prepared and approved), and every export is audited (P08).

---

## 5. Data model (analytics schema)

| Table | Key columns |
|---|---|
| `metrics` (registry mirror) | `key`, `version`, `name`, `definition`, `unit`, `grain`, `dimensions[]`, `sensitivity`, `owner` |
| `tenant_metrics` | `organization_id`, `key`, `expression` (over governed metrics), `name`, `created_by` |
| `snap_employee_day` | `organization_id`, `employee_id`, `date`, dimension columns…, `status` (partitioned by month) |
| `snap_person_day` | `organization_id`, `person_id`, `date`, `roles[]`, `entity_id`, `location_id` (partitioned by month; feeds `workforce.total_persons`) |
| `agg_*` (payroll_cost_month, attendance_month, leave_month…) | `organization_id`, period, dimension keys, measures |
| `dashboards` | `organization_id`, `name`, `owner`, `template_key?`, `layout jsonb`, `filters jsonb`, `shared_with jsonb`, `is_role_home` |
| `widgets` | `dashboard_id`, `metric_key`, `dimensions[]`, `period`, `compare`, `chart`, `filters jsonb`, `position` |
| `saved_reports` | `organization_id`, `name`, `base_entity`, `columns jsonb`, `filters jsonb`, `group_by jsonb`, `owner`, `shared_with` |
| `subscriptions` | `target` (dashboard/report), `schedule`, `format`, `recipients`, `send_if_data`, `last_run_at`, `status` |
| `prepared_results` | `query_hash`, `organization_id`, `requested_by`, `status`, `file_id`, `expires_at` |
| `product_analytics.events` (S1, §4.10) | `event_key`, `occurred_at` (minute), `product`, `module`, `screen_id`, `tenant_pseudonym`, `user_pseudonym`, `role_template`, `surface`, `locale`, `size_band` (no `organization_id`; partitioned by month; deleted after 13 months) |
| `product_analytics.daily_agg` | `date`, `tenant_pseudonym`, `product`, `event_key`, `screen_id`, `role_template`, counts, distinct users (no user ids) |
| `product_analytics.tenant_milestones` | `tenant_pseudonym`, `product`, `signed_up_at`, `first_value_at`, `activated_at`, `paid_at`, `size_band`, `cohort_month` |

Additional snapshot / aggregate tables (`snap_pipeline_day`, `snap_placement_day`, `snap_case_day`, `snap_enrolment_day`, `agg_expense_month`, `agg_ticket_month`, `agg_assessment_day`, `agg_provision_month`) are listed in [APX-C](APX-C-reports-metrics.md) §4.3.

All tenant tables carry `organization_id` + RLS (P01). The `metrics` registry of standard metric definitions is a **platform catalogue** (global, no `organization_id`; exempt from YX-ORG-14 per P07 YX-STAT-10); tenant custom metrics (`tenant_metrics`) carry `organization_id`.

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-MET-01 | Every number in dashboards, reports, exports, mobile cards (deferred to wave 6, §4.8) and AI answers comes from a registered metric or a record query through the metric layer; operational screen counts use the same definitions. |
| YX-MET-02 | Metrics are versioned with golden tests; a definition change bumps the version and appears in the catalogue changelog. |
| YX-MET-03 | All analytics queries apply tenant RLS, the viewer's P02 scope and field-class permissions. |
| YX-MET-04 | Breakdowns of Confidential/Special measures with groups below the tenant threshold (default 5, range 3–10) show "suppressed" (including in exports and subscriptions) for viewers without individual-level access to that data in that scope; viewers with individual access see all groups. |
| YX-MET-05 | Every widget and report shows its scope and data freshness; there is no hidden default entity (U96). |
| YX-MET-06 | Snapshots rebuild incrementally from the effective date of any back-dated change (P06). |
| YX-MET-07 | Shared dashboards/reports and subscriptions render with each viewer's or recipient's own permissions, never the author's. |
| YX-MET-08 | Scheduled deliveries attach files only when the content has no Confidential/Special data; otherwise email and WhatsApp carry a secure login link only (P04 Q6). |
| YX-MET-09 | Exports and scheduled deliveries are audited (P08). |
| YX-MET-10 | AI analytics answers only via governed metrics through the planner, showing the definitions and filters used; no free-form SQL. |
| YX-MET-11 | Tenant calculated metrics are expressions over governed metrics only; they inherit the most restrictive sensitivity of their inputs. |
| YX-MET-12 | Anonymous survey results (M09) apply the minimum group size to every viewer, including HR/Payroll Admins (no one has individual-level access to anonymous responses); teams below the minimum roll up into their parent group. |
| YX-MET-13 | Every standard report in the library ([APX-C](APX-C-reports-metrics.md)) is built on registered metrics or governed record queries through the metric layer; a standard report ships only with its catalogue row (owner, wave, audience, sensitivity, format, as-on / period), and each measure it shows is registered in the metric dictionary (11-analytics §5 or APX-C §2–§4). |
| YX-MET-14 | **DEI (C3):** diversity attributes come only from voluntary self-identification with "prefer not to say"; candidate self-ID is stored apart from the application and never shown to recruiters, interviewers or hiring managers; every DEI breakdown applies the small-group threshold to **every** viewer (HR included) for disability and for gender / age cells, rolling small cells into a combined group; the pay-gap metrics are Confidential. |
| YX-MET-15 | **Tenant health (C8):** the `platform.tenant_health.*` feed to YukthiX carries only counts, rates, scores and platform object IDs computed from usage metadata; it never carries employee or candidate names, HR record content or Confidential / Special values, and the tenant's admins can see the same scores. |
| YX-MET-16 | **Attrition risk (B16):** individual attrition-risk scores are Confidential, visible only to holders of `analytics.attrition_risk.view`, always shown with their contributing factors and model version, and never delivered in bulk exports or subscriptions to recipients without that grant; managers see band counts for their scope with suppression. |
| YX-MET-17 | **AI quality (B13):** every AI feature reports `ai.eval.score`, `ai.drift.index`, `ai.bias.impact_ratio` and `ai.human_override_rate` per model / prompt version through the metric layer; platform-level AI metrics are built from eval runs and anonymised counters only (no tenant content); a version below its registered thresholds is not promoted. |
| YX-MET-18 | **Assessment fairness & validity metrics (A13):** `assess.impact_ratio`, `assess.dif_grade`, `assess.predictive_validity` and `assess.fairness_findings.open`, fed from T05 `fairness_analyses` / `validity_studies`, with the minimum-group suppression rule and an owner dashboard for test authors and HR analytics. |
| YX-MET-19 | **Product analytics events (S1):** product-analytics events are registered in code with their allowed properties and carry only event key, minute timestamp, product, module, screen ID, tenant pseudonym, pseudonymous user id, role template, surface, locale and size band; they never carry names, contact details, employee or candidate ids, record content, free text, amounts, search terms or any HR data. A CI check fails the build on an unregistered event or property; events are sent server-side, never through third-party scripts. |
| YX-MET-20 | **Product analytics storage and access (S1):** events live in the separate `product_analytics` schema, not joinable to tenant schemas; raw events are deleted after 13 months; only YukthiX staff with the product analytics role can read it (P14 YX-CONSOLE-08); a tenant that opts out of non-essential analytics emits no product-analytics events, while billing meters, security logs, the tenant-health feed and setup-hub progress continue. |
| YX-MET-21 | **Product metrics (S1):** funnel conversion (sign-up → first value → activated → paid), time to first value per product (HR first payslip preview, Assess first test invite sent, Hire first job posted), activation rate, trial conversion, cohort retention, feature adoption and quick-start completion are governed `product.*` metrics with versioned definitions and golden tests (YX-MET-02); growth dashboards and P20 reports use only these metrics. |
| YX-MET-22 | **Total-workforce headcount counts persons (Validation pass 3 Must follow-up, 28 Sep 2026).** The metric `workforce.total_persons` (distinct persons with at least one active workforce role on the date, from `snap_person_day`) is the only source for total-workforce headcount on dashboards, the directory filter and reports; role-level headcounts (`employee` headcount, contract-worker headcount) stay separate series and are never summed into a total (P01 YX-ORG-26, M13 YX-CLRA-14). |
| YX-MET-23 | **Statutory and ESG disclosure packs (R6 / R7 / T5):** the SEBI BRSR workforce pack and the Companies Act Board's-report pack are built only from registered `esg.*`, `cases.*`, `learning.*` and workforce metrics for a legal entity and financial year; each pack goes preparer → reviewer (CFO or Company Secretary) → approve, and on approval is frozen as a numbered version with its metric versions and data cut-off; a back-dated change never alters an approved version (a new version is prepared); every export is audited. |
| YX-MET-24 | **Disclosure suppression and gender categories (R6 / R7):** breakdowns below the legal-entity totals in the disclosure packs apply the small-group threshold to every viewer (as YX-MET-14); entity totals required by law are shown in full only to the pack's preparer and approvers, with small cells flagged and never sent in subscriptions; gender is counted as male / female / transgender / other with "prefer not to say" and unknown as separate counts, never inferred. |

---

## 7. UI
- **Analytics home:** my dashboards, shared with me, templates, report library, explorer.
- **Dashboard builder:** grid, widget wizard (metric → dimension → period → chart), filters bar, share dialog with "viewers see only their own scope" note.
- **Report builder:** columns picker (locked icons for fields you can't use), filters, group-by, preview, save / schedule / export.
- **Metric catalogue:** definitions, formula, owner, changelog, "used in" list.
- **Subscriptions:** list with last run and status.

---

## 8. Migration (exam app)
1. Register the assessment and pipeline measures as metrics; the existing dashboards read through the planner.
2. The weekly digest becomes a subscription on a template dashboard.
3. Keep the exporters; route them through the metric layer and audit.

---

## 9. Acceptance tests (samples)
- Headcount on the HR dashboard, the explorer and an export (and, from wave 6, the mobile card) for the same scope and date are identical (YX-MET-01).
- A department head sees attrition for their subtree only; a shared "Company attrition" dashboard shows them only their scope (YX-MET-03/07).
- Salary cost by department for a department of 3 shows "suppressed" in the widget and in the XLSX export (YX-MET-04).
- A retro transfer effective 1 Aug updates July/August headcount by department after the next snapshot run (YX-MET-06).
- "What was attrition in Chennai sales last 6 months?" returns the governed metric with its definition; a question needing salary data is refused for a user without salary permission (YX-MET-10).
- The DEI template shows disability count for a department of 3 as "combined" even to an HR Admin; a recruiter can't see any candidate's self-ID answer (YX-MET-14).
- The tenant-health feed row for a tenant contains active-user ratio and ticket counts but no employee names or salary figures (YX-MET-15).
- A manager sees "High risk: 2" for their team but no names; an HR Admin with the grant sees each score with its top factors (YX-MET-16).
- A `feature_used` event from the payroll screen contains the screen ID and role template but no employee id, amount or name; a build that adds a `search_text` property fails CI (YX-MET-19).
- A tenant that switches off non-essential analytics produces no rows in `product_analytics.events`, but its billing meters and health score keep updating; a raw event older than 13 months is gone (YX-MET-20).
- An HR tenant that signs up on 1 Oct and previews its first payslip on 1 Oct 10:40 counts toward `product.time_to_first_value` for HR with the same value on every growth dashboard (YX-MET-21).
- The FY 2026-27 BRSR pack is approved; a back-dated exit entered in May changes the live turnover metric but not the approved pack, which keeps the approved figure until a new version is approved (YX-MET-23).
- A department head opening the BRSR drill-down sees "combined" for a location with 2 differently-abled employees; the Board's-report pack shows 1 transgender employee at entity level to the preparer, flagged as a small group (YX-MET-24).

---

## 10. Open questions (answer one at a time)
Includes the 6 questions left open in 11-analytics §8.

| # | Question | Recommendation |
|---|---|---|
| Q1 | Attrition definition: who counts? | **Exits ÷ average headcount**, monthly and annualised; **permanent + probation employees by default**; contractors and interns reported as separate series (tenant can include them). Split voluntary / involuntary / regretted. |
| Q2 | Small-group suppression threshold | **5**, configurable per tenant between 3 and 10. |
| Q3 | Cost per hire: which costs? | **Agency fees, job-board spend, referral bonuses (from payroll), assessment costs**, plus optional manual "other costs"; recruiter time excluded at launch. |
| Q4 | Custom dashboards: who may build them? | **HR Admin, Payroll Admin, System Admin and department heads by default** (`analytics.dashboard.build`); tenants can grant it to others. Everyone can view dashboards shared with them. |
| Q5 | Can tenants create their own metrics? | **Calculated metrics over governed ones** (e.g. "overtime cost per head") at launch; no raw SQL metrics. |
| Q6 | Analytics storage | **Postgres analytics schema + pre-aggregates** (read replica when needed); add a column store only when tenant sizes demand it. |
| Q7 | Scheduled delivery channels | **Email (file attachments for permitted recipients) + in-app**, WhatsApp **link-only** notice; PDF dashboard snapshots included. |
| Q8 | AI "ask analytics": when? | **After the metric layer is live, in wave 5** (with Engage/Performance), as governed-metric answers only; AI narratives in the monthly digest at the same time. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Attrition = exits ÷ average headcount** (monthly + annualised), counting **permanent + probation** employees by default (employment-type category, P01); contractors and interns reported as **separate series**; tenant may include them in the main figure. Split voluntary / involuntary / regretted; early attrition (< 90 / 180 days) as sub-metric. | 25 Sep 2026 |
| Q2 | **Small-group suppression: groups below 5 (tenant-configurable 3–10) are hidden in breakdowns of Confidential/Special measures, only for viewers who lack individual-level access to that data** (e.g. department heads, executives, finance with cost-only view). Viewers with individual access in that scope (HR/Payroll Admins) see all groups. Applies equally to exports and subscriptions. Updates YX-MET-04 and P02 YX-SEC-14. | 25 Sep 2026 |
| Q3 | **Cost per hire = (agency fees + job-board spend + referral bonuses paid + assessment costs + optional manual "other" costs) ÷ hires**, per job / source / period. Recruiter time excluded at launch. Requires simple cost entry for job boards/campaigns and "other" in the ATS. | 25 Sep 2026 |
| Q4 | **Custom dashboard building (`analytics.dashboard.build`) by default for HR Admin, Payroll Admin, System Admin and department heads**; tenant can grant it to other roles/people. Everyone can view dashboards shared with them, limited to their own scope (YX-MET-07). | 25 Sep 2026 |
| Q5 | **Tenant calculated metrics** built with a formula builder over governed metrics only (no SQL); usable everywhere like standard metrics; inherit the most restrictive sensitivity of their inputs (YX-MET-11); governed metrics cannot be redefined. | 25 Sep 2026 |
| Q6 | **Postgres analytics schema** (daily snapshots + monthly pre-aggregates, same RLS, partitioned by month), background prepared results for heavy queries; add a **read replica** when load requires; a column store (e.g. ClickHouse) only if tenant sizes demand it, behind the unchanged metric layer. | 25 Sep 2026 |
| Q7 | **Scheduled delivery: email + in-app; WhatsApp link-only.** Email **attaches** the file (XLSX / CSV / PDF dashboard snapshot) only when the content has no Confidential/Special data; otherwise the email carries a **secure login link** to download (consistent with P04 Q6). Decided automatically from field sensitivity. Send-if-data option; each recipient gets a permission-filtered version. | 25 Sep 2026 |
| Q8 | **AI "ask analytics" ships in wave 5**, after the metric layer and dashboards are live; answers only via governed metrics with the asker's permissions (YX-MET-10); AI narrative in the monthly leadership digest at the same time; reuses the exam app's AI layer and credit metering. | 25 Sep 2026 |
| F4/H2–H5 | **Report library & metric extensions (consistency fix; GAP-REGISTER F4, H2–H5):** standard report library enumerated in [APX-C](APX-C-reports-metrics.md) §1 (131 reports incl. the month-end provisions report); metric dictionary extended for expenses, learning, helpdesk & cases, engage, assessment operations, approvals and platform (APX-C §2), finance provisions (§3), compensation and lifecycle metrics with new snapshot / aggregate tables (§4); eight more role templates (§5); rule YX-MET-13. | 26 Sep 2026 |
| C3 | **Gap-register extension (user decision 26 Sep 2026): DEI dashboard template & pay-gap metric.** Shipped, company-enabled "Diversity, equity & inclusion" template (D17 starter): gender / age / disability / location distributions by level and department, hiring-funnel diversity with stage selection-rate ratios (shared 4/5ths logic with A13), movement by gender, **gender pay gap** (unadjusted median / mean + adjusted within grade × location × tenure) and pay-equity flags (starter ±10 %); voluntary self-ID only, candidate self-ID hidden from hiring roles, suppression for every viewer (§4.9 A, YX-MET-14). Included in the price (D18); wave 5. | 26 Sep 2026 |
| C8 | **Gap-register extension (user decision 26 Sep 2026): tenant-health metrics feed.** Platform metric domain `platform.tenant_health.*` (active-user ratio, modules used, setup completeness, on-time payroll, mobile adoption, tickets and ageing, NPS / CSAT, integration failures, API and AI usage) computed nightly from usage metadata, feeding P14 `tenant_health` and customer-success tooling; no HR content or Confidential / Special values leave the tenant; tenant admins see the same scores (§4.9 B, YX-MET-15). Before public launch. | 26 Sep 2026 |
| B16 | **Gap-register extension (user decision 26 Sep 2026): workforce-planning & attrition-risk metrics.** P09 registers the measures of the B16 features owned by M10 / M01 / M06 / P10 (planned headcount, plan variance, scenario cost, vacancy rate and time vacant, IDP coverage, internal fill rate, risk-band counts); individual attrition-risk scores Confidential behind `analytics.attrition_risk.view` (starter: HR Admin), always explained, band counts with suppression for managers (§4.9 C, YX-MET-16). Wave 6. | 26 Sep 2026 |
| B13 | **Gap-register extension (user decision 26 Sep 2026): AI-quality metrics.** `ai.eval.score`, `ai.drift.index`, `ai.bias.impact_ratio`, `ai.human_override_rate`, `ai.answer_feedback`, `ai.latency_p95`, `ai.credits_used` per AI feature × model / prompt version; tenant "AI quality" dashboard template and the YukthiX AI governance console (aggregate, no tenant content); promotion gated on registered thresholds (§4.9 D, YX-MET-17). Wave 5. | 26 Sep 2026 |
| S1 | **Validation pass 3 Must (S1), founder decision 28 Sep 2026 (option C): own product analytics on the P09 metric layer.** Usage event stream (feature used, screen, product, tenant, role; pseudonymous user id; never personal or HR data), funnels (sign-up → first value → activated → paid), time to first value per product (first payslip preview, first test invite sent, first job posted), cohort retention and feature adoption as governed `product.*` metrics; separate `product_analytics` schema with 13-month retention and access only for YukthiX staff roles (P14 YX-CONSOLE-08); tenant opt-out of non-essential analytics; feature flags and gradual rollout stay in the P13 brief (#7). §4.10, YX-MET-19–21; business use in P20. Before public launch; included (D18). | 28 Sep 2026 |
| Validation pass 3 Must follow-up, 28 Sep 2026 | **Total-workforce headcount = distinct persons:** new snapshot `snap_person_day` and metric `workforce.total_persons` (P01 YX-ORG-26); rule YX-MET-22. | 28 Sep 2026 |
| R6 / R7 / T5 | **Validation pass 3 Should (R6/R7/T5), founder decision 28 Sep 2026: statutory and ESG disclosure packs.** SEBI BRSR workforce pack (Principles 3 and 5: employees and workers by gender × permanent / other, differently-abled, turnover, benefits coverage PF / gratuity / ESI, parental-leave return and retention, well-being spend, median wages by gender and gross wages paid to females, POSH and other complaints, union membership, LTIFR, training hours; BRSR-layout export, XBRL format to verify) and Companies Act Board's-report pack (POSH received / disposed / pending > 90 days, Maternity Benefit Act statement, headcount by gender incl. transgender — rule date to verify; needs the P01 gender list to include transgender); small-group suppression and preparer → reviewer → approve sign-off with frozen versions (§4.11, YX-MET-23 / 24; APX-C RPT-ESG-01…03, §2.9). Wave 5. | 28 Sep 2026 |
