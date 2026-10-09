# 11 · Analytics — Functional & UI Reference

> **Purpose.** Analytics is the fourth YukthiX product (spec §1.4, "reporting across all products"). This document records what Frappe offers, what the exam app already has, and what YukthiX Analytics should be: metric definitions, screens and architecture.
> **Scope:** spec §1.4.1–1.4.8. It combines the functional reference (behaviour) and the UI reference (screens) in one document, because analytics cuts across every module.
> **Clean-room:** Frappe *Framework* is MIT-licensed (verified earlier); HRMS and India Payroll are GPL-3. Only behaviour and layouts are recorded here, never code, queries or wording.
> **Captured:** 24 Sep 2026 on the local test instance, using the demo data from modules 01–09. 14 screenshots in [`../ui-screens/11-analytics/`](../ui-screens/11-analytics/). Internal reference only.

---

## 0. What the spec asks for (§1.4)

| # | Item | Content |
|---|---|---|
| 1.4.1 | Report builder | Self-service reports across any module |
| 1.4.2 | Dashboards | Role-based: executives, HR, recruiters, department heads, managers |
| 1.4.3 | Scheduled reports & exports | Subscriptions, scheduled delivery, Excel and PDF |
| 1.4.4 | Assessment | Score distribution, percentile, question performance, integrity flags |
| 1.4.5 | Recruitment | Time to hire, cost per hire, source effectiveness, pipeline conversion, offer acceptance |
| 1.4.6 | Staffing & revenue | Placements, margin, bench utilisation, SLA performance, billing vs collection |
| 1.4.7 | Workforce | Headcount, attrition, retention, diversity, cost, span of control |
| 1.4.8 | Payroll & compliance | Cost trends, statutory liability, audit-ready registers |

---

## 1. What Frappe offers

### 1.1 Framework building blocks (MIT, used by every Frappe app)

| Block | What it does | Screens |
|---|---|---|
| **Report view (report builder)** | Any list becomes a grid: choose columns (including child-table fields), filters, sort, **group-by** with counts, totals row, save as a named report, export CSV/Excel, print | [05](../ui-screens/11-analytics/05-report-builder-employee.png), [06](../ui-screens/11-analytics/06-report-builder-group-by.png), [08](../ui-screens/11-analytics/08-saved-report-employee-information.png) |
| **List sidebar counts** | Per-field group counts on any list (assigned to, created by, tags, chosen fields) | [07](../ui-screens/11-analytics/07-list-sidebar-group-counts.png) |
| **Query / Script reports** | Developer-written reports with filters, a chart above the grid, tree grouping and a summary strip. "Prepared report" mode runs heavy reports in the background. | e.g. [04](../ui-screens/11-analytics/04-report-employee-analytics.png) |
| **Dashboard chart** | A chart defined on data: **Count / Sum / Average / Group-by** of a document type, a report's chart, or custom code. Settings: time series (timespan, interval), static filters, **dynamic filters** (e.g. company = user's default), public or private, colours. | [09](../ui-screens/11-analytics/09-dashboard-chart-config.png) |
| **Number card** | One number: an aggregate on a document type (count/sum/avg with filters), a report field or a custom method; optional "% change vs previous period" | [10](../ui-screens/11-analytics/10-number-card-config.png) |
| **Dashboard** | A named set of cards and charts. Each chart can be filtered, re-timed and expanded in place. | [01](../ui-screens/11-analytics/01-dashboard-human-resource.png)–[03](../ui-screens/11-analytics/03-dashboard-attendance.png) |
| **Auto Email Report** | Schedule any report: **Daily / Weekdays / Weekly / Monthly**; format **HTML / XLSX / CSV / PDF**; "based on permissions for user X"; send only if there is data; dynamic date filters (e.g. last month); recipients; message | [11](../ui-screens/11-analytics/11-auto-email-report-new.png) |
| Permissions | Charts, cards and reports respect document-type permissions; charts can be public or private | — |

**No BI layer.** There is no semantic or metric layer, no point-in-time history, no cross-document joins in the self-service builder (only child tables), and no drill-down from chart to records beyond the list link. Frappe's separate "Insights" BI app is **not installed** on this instance and out of scope.

### 1.2 HRMS + India Payroll content (GPL; behaviour only)

**37 reports:**

| Module | Reports |
|---|---|
| HR (18) | Employee Analytics, Employee Birthday, Employee Information (saved report view), Employee Exits, Employee Leave Balance, Employee Leave Balance Summary, Leave Ledger, Monthly Attendance Sheet, Shift Attendance, Employees working on a holiday, Employee Advance Summary, Unpaid Expense Claim, Vehicle Expenses, Recruitment Analytics, Appraisal Overview, Daily Work Summary Replies, Employee Hours Utilization (timesheet), Project Profitability |
| Payroll (10) | Salary Register, Employee CTC Break-up, Income Tax Computation, Income Tax Deductions, Professional Tax Deductions, Provident Fund Deductions, Bank Remittance, Salary Payments Based On Payment Mode, Salary Payments via ECS, Accrued Earnings |
| India Payroll (4) | EPF Register (+ ECR file), ESIC Register (+ portal export), LWF Register (+ remittance export), Bank Mandate |
| Projects (5, ERPNext) | Timesheet and project summaries |

**37 dashboard charts** and **40 number cards**, grouped into 6 HR dashboards: Human Resource, Attendance, Employee Lifecycle, Expense Claims, Recruitment, Payroll. They include:
- headcount by department / designation / branch / grade / type;
- gender diversity ratio;
- employees by age band;
- hiring vs attrition count;
- outgoing salary trend;
- department- and designation-wise salary;
- applicant pipeline, sources, offer status;
- appraisal overview;
- claims by type.

**Coverage against the spec domains:**

| Spec domain | Frappe coverage |
|---|---|
| 1.4.4 Assessment | ❌ none |
| 1.4.5 Recruitment | ⚠️ counts, pipeline pie, time to fill, offer acceptance %, applicant-to-hire % (definitions weak, §3); no cost per hire, no stage conversion or time-in-stage |
| 1.4.6 Staffing & revenue | ⚠️ timesheet billing and project profitability (ERPNext Projects) only |
| 1.4.7 Workforce | ⚠️ headcount splits, age, gender, joiners and leavers counts; **no attrition rate, retention, tenure, span of control, cost per head, or history** |
| 1.4.8 Payroll & compliance | ✅ registers (strongest area); ⚠️ cost trend = one "outgoing salary" line; no statutory liability view |

---

## 2. What the exam app already has (from the reuse inventory §3)

| Spec item | Status | Evidence |
|---|---|---|
| 1.4.1 Report builder | **Missing** | Fixed reports only |
| 1.4.2 Dashboards | **Partial** | Recruiter dashboard, Today home, platform console; v2 dashboard components (StatCard, IconStatCard, StatsHero, Gauge, AnalyticsTiles, DashboardLists) |
| 1.4.3 Scheduled & exports | **Partial** | Weekly digest email; CSV/XLSX/PDF exam-result exports; audit CSV. No per-report subscriptions or generic export |
| 1.4.4 Assessment | **Done** | Summary, question accuracy, item analytics (difficulty, discrimination, distractors), integrity dashboard |
| 1.4.5 Recruitment | **Partial** | Funnel, time-to-hire, sources, **AI funnel narrative**. Cost per hire and offer acceptance unverified |
| 1.4.6–1.4.8 | **Missing** | Not in that codebase |

**Conclusion:** YukthiX Analytics = the exam app's assessment and hiring analytics + a new **workforce, time, pay and compliance** layer + a **shared report builder, dashboards and scheduler** for all four products.

---

## 3. Metric definitions found in Frappe — and their problems

| Metric (Frappe) | How Frappe computes it | Problem | YukthiX definition (§5) |
|---|---|---|---|
| Applicant-to-hire % | Applicants with status "Accepted" ÷ **all applicants ever** | No period, no per-job scope; "Accepted" is a manual status | Hires ÷ applicants **for requisitions closed in the period**, per job / source |
| Job offer acceptance rate | Accepted ÷ **all submitted offers** (optionally by company/department) | Offers still *awaiting response* count against the rate | Accepted ÷ (accepted + declined) among offers **decided** in the period; pending shown separately |
| Time to fill | Per requisition: completed on − posting date, averaged over "Filled" requisitions | Only when someone sets "Filled" and a completed date by hand; a multi-position requisition gives one number | Per position: approval date → offer accepted date; median + distribution |
| Hiring vs attrition | Count of joining dates vs count of relieving dates per period | Counts only; **no attrition rate**; our demo showed no bars at all ([01](../ui-screens/11-analytics/01-dashboard-human-resource.png)) | Attrition % = exits ÷ average headcount, monthly and annualised; voluntary / involuntary; regretted |
| Employee exits (this year) vs relieving (this quarter) | Counts relieving dates in the window | Meera (relieving 19 Oct, in future) counts as an exit "this year" but not "this quarter": two cards, two definitions ([01](../ui-screens/11-analytics/01-dashboard-human-resource.png)) | Exits counted on last working day ≤ today; planned exits shown separately as "serving notice" |
| Outgoing salary (last month) | Sum of net pay of slips whose **posting date** is in the window | Window and date field are not shown; our Sep slips (posted 30 Sep) show as ₹0 today ([02](../ui-screens/11-analytics/02-dashboard-payroll.png)) | Payroll cost by **pay period**, with the run status (draft / approved / paid) shown |
| All standard charts | Dynamic filter **company = the user's default company** ([09](../ui-screens/11-analytics/09-dashboard-chart-config.png)) | The root cause of the "dashboard shows 0 / No Data" seen in Leave U1 and Attendance U1; the scope is invisible | Scope chip on every widget; defaults to the user's permitted entities, all by default |

---

## 4. Screens observed

| Screen | Layout | Keep / improve |
|---|---|---|
| Human Resource dashboard [01](../ui-screens/11-analytics/01-dashboard-human-resource.png) | 5 number cards (total, new hires this year, exits this year, joining/relieving this quarter), hiring-vs-attrition line, age histogram, pies (gender, type, grade, branch, designation, department) | **Keep** the card row + chart grid. **Improve:** pies with 1 slice ("Employees by Grade: 6" unlabeled) are noise; use bar charts with labels; show rates, not only counts; every widget shows its scope and definition |
| Payroll dashboard [02](../ui-screens/11-analytics/02-dashboard-payroll.png) | Declaration count, structures, incentives, outgoing salary card + 12-month line + department/designation salary bars | All ₹0 / "No Data" after a real ₹5.8 L run (posting-date window). Show run status and pay period |
| Attendance dashboard [03](../ui-screens/11-analytics/03-dashboard-attendance.png) | Present/absent/late cards + attendance count line | Covered in module 02 §1.1 |
| Employee Analytics report [04](../ui-screens/11-analytics/04-report-employee-analytics.png) | Filter company + "parameter" (Branch / Grade / Department / Designation / Employment type) → donut + employee grid | Good "pick a dimension" idea; YukthiX: any metric × any dimension in the explorer (§6) |
| Report view [05](../ui-screens/11-analytics/05-report-builder-employee.png) / [06](../ui-screens/11-analytics/06-report-builder-group-by.png) / saved [08](../ui-screens/11-analytics/08-saved-report-employee-information.png) | List → grid; column picker, filters, "Add Group", sort, page sizes; save as report | **Keep** as the base of the report builder; add joins across entities, calculated columns, charts, sharing and schedule from the same screen |
| List sidebar counts [07](../ui-screens/11-analytics/07-list-sidebar-group-counts.png) | Group counts per field in the list sidebar | Useful quick-insight pattern for lists |
| Chart config [09](../ui-screens/11-analytics/09-dashboard-chart-config.png) · Number card [10](../ui-screens/11-analytics/10-number-card-config.png) | Admin forms: document type, aggregate, group-by field, filters, dynamic filters, timespan, colour | Too technical for HR users. YukthiX: build a widget from a **metric** and pick dimension + period, no field names |
| Auto email report [11](../ui-screens/11-analytics/11-auto-email-report-new.png) | Report, permissions of user, send-if-data, filters, dynamic dates, recipients, frequency, format | **Keep the options**; move them into a "Schedule" action on any report or dashboard; add WhatsApp delivery and a PDF snapshot of dashboards |
| Birthday [12](../ui-screens/11-analytics/12-report-employee-birthday.png) · Hours utilisation [13](../ui-screens/11-analytics/13-report-hours-utilization.png) · HR workspace reports menu [14](../ui-screens/11-analytics/14-workspace-reports-sidebar.png) | Simple script reports; a flat alphabetical list of ~25 reports in the sidebar | Group reports by question ("Who is leaving?", "What does payroll cost?"), with search and favourites |

---

## 5. YukthiX metric dictionary (governed definitions)

Each metric is defined **once** in a metric layer (§6) with:
- a name, a plain-language definition and a formula;
- its grain, dimensions and source;
- **who may see it** (sensitivity).

Every widget, report and export uses these definitions. That delivers principle 2 of the [UI brief](99-ui-design-brief.md): one number, everywhere.

**Standard dimensions** (where they apply): legal entity, location, department, designation, grade, employment type, manager, gender, age band, tenure band, cost centre, period (day / week / month / quarter / FY).

### 5.1 Workforce (1.4.7)

| Metric | Definition / formula | Notes |
|---|---|---|
| Headcount | Active employees on a date (effective-dated), excluding not-yet-joined | Point-in-time from the **daily snapshot** |
| Average headcount | Mean of daily (or opening + closing) headcount in the period | The denominator for rates |
| Joiners / exits | Count by date of joining / last working day in period | Planned exits (serving notice) shown separately |
| **Attrition %** | Exits ÷ average headcount; monthly, and annualised (×12/months) | Split: voluntary / involuntary / regretted; early attrition (< 90 / 180 days) |
| Retention % | Employees at start still employed at end ÷ headcount at start | Cohort by joining month |
| Tenure | Median years of service; tenure bands | |
| Diversity | Share by gender (and other attributes where legally collected) per level | **Small-group suppression**: hide splits with < 5 people |
| Span of control | Direct reports per manager (median, distribution); layers | From the reporting-line history |
| Cost per head | Payroll cost (employer cost incl. PF/ESI/gratuity provision) ÷ average headcount | Links to 5.4 |
| Open positions / budget used | From the headcount plan (module 08) | Plan vs actual |

### 5.2 Time & attendance (module 02, part of 1.4.7)

| Metric | Definition |
|---|---|
| Attendance % | Present days ÷ scheduled working days |
| Absenteeism % | Unplanned absent + LWP days ÷ scheduled days |
| Late-coming | Late entries per employee per month; average minutes late |
| Overtime | Approved OT hours and cost; % of employees above statutory caps |
| Leave utilisation | Days taken ÷ days accrued, by type; negative balances; lapse at year end |
| Regularisations | Requests per 100 employees; approval turnaround |

### 5.3 Recruitment (1.4.5) — merges the exam-app metrics

| Metric | Definition |
|---|---|
| Time to hire | Application → offer accepted, per hire (median) |
| Time to fill | Requisition approved → offer accepted, per position (median) |
| Pipeline conversion | Stage-to-stage conversion + time in stage, per job and source |
| Source effectiveness | Hires, quality (90-day retention, first appraisal band) and cost per source |
| Offer acceptance % | Accepted ÷ decided offers; declines by reason |
| **Cost per hire** | (Internal recruiting cost + agency fees + job-board spend + referral bonuses) ÷ hires | Needs a cost-entry screen; referral bonus from payroll |
| Assessment pass-through | Candidates passing the proctored test ÷ attempted (links to 1.4.4) |

### 5.4 Payroll & compliance (1.4.8)

| Metric | Definition |
|---|---|
| Payroll cost | Gross, net, employer contributions, total employer cost by pay period; trend and variance vs last month (with reasons: joiners, leavers, revisions, LOP, bonus) |
| Cost by dimension | Department, location, cost centre, component |
| **Statutory liability** | PF, ESI, PT, LWF, TDS **due / paid / overdue** per month and entity (from the monthly statutory checklist, module 04) |
| Tax | TDS deducted vs projected; regime split; declarations and proofs pending |
| F&F | Settlements pending, average days to settle vs the 2-working-day rule |
| Registers | Audit-ready registers (EPF/ESIC/PT/LWF, salary register, muster) remain **reports**, not dashboards |

### 5.5 Assessment (1.4.4) — already built in the exam app
Score distribution, percentile, question difficulty and discrimination, distractor analysis, integrity flags per exam, cohort and job. **Reuse as is**; expose through the shared explorer and scheduler.

### 5.6 Staffing & revenue (1.4.6) — for the External ATS (later)
Placements, margin per placement (bill rate − pay rate − costs), bench utilisation, client SLA (time to submit / fill), billing vs collection. Defined now so the data model captures them; built with the External ATS (after HRMS wave 5).

### 5.7 Performance & engagement (modules 07, 09)
Goal completion %, rating distribution vs target curve, calibration shifts, reviews on time, training hours per employee, mandatory-training compliance %, case volume and SLA, POSH cases (**restricted**: counts only, to the Internal Committee and leadership).

---

## 6. YukthiX Analytics — product and architecture

### 6.1 Architecture (for the design phase)
- **Metric layer (semantic layer)** in the platform: metrics and dimensions defined in code or config once, compiled to SQL. Every API, widget, export and AI answer reads from it.
- **Point-in-time history:** HR analytics needs "as on date". Keep **effective-dated** employee history (job, manager, location, pay) and a **daily headcount snapshot** table. Frappe has neither, which is why it can't compute attrition rates.
- **Same security as the app:** queries run through Postgres **RLS** (tenant) + record visibility (manager hierarchy, entity) + field sensitivity (salary, gender, POSH). **Small-group suppression** (< 5) on sensitive splits.
- **Performance:** pre-aggregated daily/monthly tables refreshed by BullMQ jobs; heavy reports run as background "prepared" jobs with a notification when ready (Frappe's prepared-report idea).
- **Exports:** Excel (formatted, with totals), CSV, PDF (branded), and scheduled delivery by email / WhatsApp link. All exports are audited (who exported what).
- **AI layer:** ask-a-question ("attrition in Chennai sales last 6 months?") → answered **only from governed metrics**, showing the definition and filters used. Extends the exam app's AI funnel narrative and AI metering. Monthly AI narrative for the leadership digest.

### 6.2 Target screens

| # | Screen | Built from | Notes |
|---|---|---|---|
| 1 | **Role dashboards**: Executive, HR, Payroll/Finance, Recruiter (exists), Department head, Manager | Frappe dashboards (layout), exam-app v2 dashboard components | Scope chip, definition tooltip, drill-down to records; ≤ 8 widgets each |
| 2 | **Metric explorer** | Frappe Employee Analytics "pick a dimension" | Any metric × dimension × period; trend / breakdown / table; save as widget |
| 3 | **Report builder** | Frappe report view | Joins across entities via the metric layer, calculated columns, group-by, totals, chart, save, share, schedule |
| 4 | Report library | Frappe reports menu | Grouped by question, search, favourites; statutory registers in a Compliance section |
| 5 | Schedules & subscriptions | Frappe auto email report | "Schedule" on any report/dashboard; daily/weekly/monthly; XLSX/PDF/CSV; email + WhatsApp; send-if-data; run as a role |
| 6 | Exports & audit | — | Export log per user |
| 7 | Ask analytics (AI) | Exam-app AI narrative | Governed answers with definitions shown |
| 8 | Metric catalogue (admin) | — | Definitions, owners, sensitivity; read-only for users |

**Mobile:** manager and executive dashboards as simple cards (headcount, attrition, cost, open positions, today's attendance) in the mobile app's Home or Me tab. There are no builders on mobile.

---

## 7. Issues (continuing the U-list from modules 01–10)

| # | Where | What we saw | YukthiX rule |
|---|---|---|---|
| U96 | All standard charts | Scoped by a hidden dynamic filter "company = user's default company". Root cause of U1. | Scope chip; default = all permitted entities. |
| U97 | Payroll dashboard | Date window on posting date, not shown; a completed run shows ₹0 and "No Data". | Pay-period based; show window and run status. |
| U98 | Recruitment metrics | Applicant-to-hire over all time; offer acceptance counts pending offers; time to fill needs manual "Filled". | Governed definitions with periods (§5.3). |
| U99 | Workforce | No attrition rate, retention, tenure, span or cost per head; hiring-vs-attrition chart empty. | Metric layer + daily snapshots. |
| U100 | HR dashboard | Exit counts differ between "this year" and "this quarter" cards (future relieving date counted in one only). | One exit definition; planned exits separate. |
| U101 | Dashboards | Single-slice pies without labels; counts without rates. | Labeled bars; rates alongside counts. |
| U102 | Chart / number-card builders | Built from document types and field names; too technical for HR. | Build widgets from metrics and dimensions. |
| U103 | Reports menu | Flat list of ~25 reports; two families overlap (module 04 U43). | Report library grouped by question, with search. |

---

## 8. Design questions (for the team)

> ✅ All six answered in design doc **P09** (`design/P09-metric-layer-analytics.md` §11), 25 Sep 2026.

1. **Attrition definition:** monthly exits ÷ average headcount (annualised), with voluntary/involuntary split. Do we count contractors and interns?
2. **Small-group suppression threshold:** 5 (common) or configurable per tenant?
3. **Cost per hire inputs:** which costs will customers actually record (agency, job boards, referral bonus, recruiter time)?
4. **Scheduled delivery channels:** email + WhatsApp link at launch? PDF snapshot of dashboards?
5. **AI analytics:** in the first release or later? It needs the metric layer first.
6. **Data warehouse:** stay on Postgres with pre-aggregates (recommended for SMB scale), or add a column store later (e.g. ClickHouse) when tenants grow?

---

## 9. Capture notes

- **No new demo data.** Everything shown comes from modules 01–09 on the test instance.
- The report-view "group by" click did not open the grouping panel in the headless capture ([06](../ui-screens/11-analytics/06-report-builder-group-by.png) shows the "Add Group" button instead).
- Payroll figures show ₹0 because the September slips are dated 30 Sep, after the capture date (24 Sep). This is a demo-data timing effect, but it illustrates U97.
- **Temporary changes, reverted 24 Sep 2026:** API key (revoked); default company (restored to *workfox (Demo)*).
