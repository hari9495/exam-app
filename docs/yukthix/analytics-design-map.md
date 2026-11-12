# Analytics: designs and what exists (audit)

This file checks, story by story, every design under `Screens/Analytics/` (ANL-01 to ANL-09) against what is live, in
the same shape as `console-design-map.md`. Founder rules: never build a second, simpler version of a designed screen;
build only from the design kit; every policy choice is a company setting with a default.

Status 12 Nov 2026 (branch `docs/yukthix-analytics-map`, from `test/yukthix-main` at b33f4af6e). Audit only: nothing was
built.

## What is live today (plain English)

- **Analytics is not built.** None of the nine drawn screens is used by the web app, and the YukthiX menu hides the
  Analytics area on purpose: `apps/web/lib/yx-nav.test.ts` line 25 lists `analytics` among the "unbuilt modules [that]
  never appear". The design check agrees: all nine screens (`AnalyticsHomeScreen`, `RoleDashboardScreen`,
  `DashboardBuilderScreen`, `MetricExplorerScreen`, `ReportBuilderScreen`, `ReportLibraryScreen`,
  `MetricCatalogueScreen`, `SchedulesScreen`, `AskAnalyticsScreen`) are on the `notLive` list of
  `packages/yx-ui/src/design-live-guard.known.json`.
- **The heart of the design does not exist yet.** The designs rest on a "metric layer" (design doc
  `docs/yukthix/design/P09-metric-layer-analytics.md`): every number is defined once in code, a query planner turns
  "metric by dimension for a period" into a database query, and daily snapshots give history ("headcount on 1 April").
  There is no metric registry, no planner, no daily employee snapshot, no dashboard, widget, saved-report or
  subscription table (searches in section 3).
- **What does exist is spread over the areas.** Each live area has its own designed report page with its own API:
  Payroll reports (PAY-25, `/yx/payroll/reports`), Time reports, Expenses reports, Performance reports, Visitors
  reports, Hiring costs, and the Helpdesk reports page, which even has its own custom reports, schedules and
  wallboards. Home already shows role cards (counts) and keeps a daily snapshot of them. These are the building
  blocks Analytics should read from; they are not second versions of the Analytics screens, because each is drawn in its
  own area's design group.
- **The `apps/api/src/analytics`, `reports`, `dashboard` and `scheduled-reports` folders belong to the older exam app**,
  not to YukthiX HR: item analytics for question banks, hiring pipeline analytics, exam result reports, the exam
  dashboard, and a weekly exam digest email. Two of them are directly useful (pipeline analytics for the Recruiter
  dashboard, the CSV / XLSX / PDF exporters for every export).
- **Result:** of 50 stories, 0 are live as drawn, 1 is done today by another designed page (Helpdesk lead), 3 can be wired
  to APIs that exist (Payroll, Recruiter and Expenses dashboards), 1 is a phone view, and 45 need the feature built.

### Security facts that matter for analytics

- **Company isolation (RLS).** Every company query runs through `TenantPrismaService.forTenant`
  (`packages/shared/src/prisma/tenant-prisma.service.ts` lines 113 to 117), which sets `app.current_org`,
  `app.current_user_id` and `app.record_visibility_governed` for the database's row-level security. Any snapshot or
  aggregate table Analytics adds must carry `organization_id` and join the forced-RLS set, as P09 §5 says.
- **Who may see whom (scope).** `EmployeeHistoryService.scopeFilter(tx, company, viewer, key, employee, date)`
  (`apps/api/src/employee-history/employee-history.service.ts` line 210) already returns the SQL filter "employees this
  person may see with this key on this date". The planner should use it, so a department head sees only their subtree
  (YX-MET-03) and a shared dashboard shows each viewer only their own scope (YX-MET-07).
- **Personal fields.** Each employee field has a class (public, internal, personal, confidential, special) in
  `packages/shared/src/field-permissions/employee-fields.ts`; disability is Special (`employee.disability.view`). The
  older `GOVERNED_FIELDS` (`packages/shared/src/field-permissions/field-permissions.ts`) covers only candidate and job
  fields. The report builder's locked columns (ANL-05) must follow the employee field classes.
- **Pay data.** Pay rows sit behind a database pay guard: `app_pay_entities()` reads `app.pay_entities`, opened per
  transaction to the legal entities a person's payroll grant reaches
  (`apps/api/prisma/migrations/20261025000000_payroll_5a/migration.sql` lines 3 to 21). PAY-25 reports use one key,
  `payroll.reports.view`, scoped to legal entities, and audit every CSV export
  (`apps/api/src/payroll/payroll-reports.controller.ts`; `apps/api/src/payroll/reports.service.ts` line 17). Salary
  metrics in Analytics must open the same guard the same way, never read pay tables around it. There is no "pay totals
  only" key today for executives or department heads (question 1364).
- **Small-group hiding.** Only Performance has it today: `suppress()` in `apps/api/src/performance/calibration-rules.ts`
  line 54 and the company setting `perf.report.min_cell` (5 or 10, default 5) in
  `apps/api/src/org-structure/settings-registry.ts` line 140. P09 decided a company threshold of 5, adjustable 3 to 10,
  applied to exports and schedules too, and to every viewer for DEI, disability and anonymous surveys (YX-MET-04, 12,
  14). The kit already draws it (`suppress()` in `screens/proctoring/proctoring-logic.ts`, `minGroupSize` on charts). An
  Analytics setting is needed (question 1362).
- **Exports.** Exports are audited, but under about 25 different action names (`payroll.report.exported`,
  `time.register.exported`, `people.directory.exported`, `desk.ticket.export`, `staffing.export.*` and more). The
  company audit API filters by one exact action (`apps/api/src/audit/audit-query.service.ts` line 63), so there is no
  "every export" list for ANL-08's Export log (question 1370).
- **AI (ANL-09).** The AI module (`apps/api/src/ai/ai-invocation.service.ts`) runs a call only when the company has set
  its own AI provider key ("Settings, Integrations"), checks the AI-credit quota, and records spend in `AiCreditUsage`.
  The pattern for people data is set by Performance and Policies: a company setting per feature (for example
  `perf.ai.review_assistant`, default off) and "names never go to the model" (`apps/api/src/performance/coach.service.ts`
  lines 21 to 24; `apps/api/src/policies/policy-writer.service.ts` line 235). The AI policy in
  `docs/yukthix/design/P10-ai-layer-integration-hub.md` adds: AI never decides (YX-AI-01), no Special data to outside
  models and Confidential values masked (YX-AI-02), opt-in per company, metered and audited per call (YX-AI-03), and a
  registered, approved feature version (YX-AI-07, not built: the console map found no AI registry). P09 YX-MET-10:
  Ask analytics answers only through governed metrics, never free SQL. Nothing of Ask analytics exists.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Home and dashboards (ANL-01 to ANL-03) | 3 | 0 | 1 | 3 | 21 | 1 | 26 |
| B. Explore, reports and metrics (ANL-04 to ANL-07) | 4 | 0 | 0 | 0 | 16 | 0 | 16 |
| C. Schedules and Ask (ANL-08, ANL-09) | 2 | 0 | 0 | 0 | 8 | 0 | 8 |
| **All A-C** | **9** | **0** | **1** | **3** | **45** | **1** | **50** |

Counted by script on 12 Nov 2026 on `docs/yukthix-analytics-map` (the script is in the appendix). There are 50 stories
in 9 files whose title starts `Screens/Analytics/`: `screens/proctoring/stories/anl-01.stories.tsx` to
`anl-09.stories.tsx` (2, 17, 7, 5, 4, 4, 3, 4, 4). All nine screens are in one kit file,
`packages/yx-ui/src/screens/proctoring/analytics.tsx`, inside `AnlFrame` (area `analytics`). One story is a phone view
(ANL-02 `ManagerPhone`).

## 1. Live pages

None. No page under `apps/web/app` renders an Analytics screen (search in section 3).

## 2. Live pages that touch the same ground (not second versions)

| page | screen (kit) | API | what Analytics should do with it |
|---|---|---|---|
| `/yx/payroll/reports` | `PayrollReportsScreen` (PAY-25) | `GET /payroll/reports`, `/payroll/reports/:kind` (register, recon, variance, ctc, arrears, ytd, bank, holds, gratuity, loans), access request | list in the report library (ANL-06); feeds the Payroll dashboard |
| `/yx/time/reports` | `AttendanceReportsScreen` | `/reports/attendance`, `/reports/night` (`time/attendance-ops.controller.ts`) | list in the library |
| `/yx/expenses/reports` | `ExpenseReportsScreen` (EXP-09) | `GET /expenses/reports/:kind` (summary, unpaid, advance-ageing, over-limit, gst-input) | list in the library; feeds the Expenses dashboard |
| `/yx/performance/reports` | `PerformanceReportsScreen` | `/performance/reports/:kind` (`calibration.controller.ts`), with small groups hidden | list in the library |
| `/yx/hiring/costs` | `RecruitingCostsScreen` (HIR-11) | `GET /hiring/costs`, `/hiring/costs/overview` (`ats.costs.manage`) | cost per hire on the Recruiter dashboard |
| `/yx/desk/reports` | `SlaDashboardScreen` (SD-1.27) | `/desk/reports/dashboard`, `sla`, `library`, `funnel`, `kpis`, `custom` (save, run, CSV), `schedules`, `wallboards` (`service-desk/insights.controller.ts`, `reports.service.ts`; tables `sd_reports`, `sd_report_schedules`) | does the Helpdesk lead dashboard's job; its schedule engine already sends "each recipient's own rights" copies, the rule ANL-08 needs (question 1367) |
| `/yx/home` | `RoleHomeScreen` (PLT-02) | `GET /workspace/home` (counts per role, finance runs, dues and claims); daily `home_snapshots` job (`workspace/home-snapshot.jobs.ts`) | the Home cards stay; Analytics reuses the counts and the snapshot job pattern |
| `/yx/visitors/...` reports | visitors kit | `GET /visitors/reports` | list in the library |

Older exam-app pages (the "Assessments & more (older screens)" link still leads to `/v2`; `yx-nav.test.ts` line 30):
`/v2/analytics/hiring` (hiring funnel, time to hire, sources; `GET /analytics/hiring`), `/v2/dashboard` (exam
dashboard; `/dashboard/*`), `/v2/reports` (exam results; `reports/reports.controller.ts`) and
`/v2/settings/scheduled-reports` (the weekly exam digest; `scheduled-reports.service.ts`, columns
`scheduled_report_*` on `Organization`). These are not YukthiX designs. Unsure: I did not check which YukthiX roles can
still reach them; see question 1375.

## 3. Searches run (12 Nov 2026, on `test/yukthix-main` at b33f4af6e)

- Kit screens in the web app: `grep -rlE "AnalyticsHomeScreen|RoleDashboardScreen|DashboardBuilderScreen|MetricExplorerScreen|ReportBuilderScreen|ReportLibraryScreen|MetricCatalogueScreen|SchedulesScreen|AskAnalyticsScreen" apps/web packages`:
  hits only in `packages/yx-ui/src/screens/proctoring/analytics.tsx`, the nine story files and
  `design-live-guard.known.json` (`notLive`). **None in `apps/web`.**
- Route folders: `find apps/web/app -type d` for report, analytic, dashboard, metric, schedul, export: only the area
  pages in section 2 and the `/v2` exam pages. No `/yx/analytics`.
- API (`apps/api/src`, `packages/shared/src`, `*.ts` without specs), keyword: result.
  - `attrition_rate|metric.?registry|MetricRegistry|query.?planner`: none.
  - `attrition`: none (no attrition figure anywhere in the API).
  - `'analytics\.[a-z_.]+'` (keys such as `analytics.dashboard.build`): none.
  - `ask.?analytics|nl.?query|text.?to.?sql`: none.
  - `minGroup|suppress`: only Performance (`calibration-rules.ts`, `comp-rules.ts`, `reports.service.ts`).
- Schema (`apps/api/prisma/schema.prisma`): no model named Metric, Dashboard, Widget, SavedReport, Subscription,
  PreparedResult, Snap or Agg. Close relatives that exist: `WorkforceSnapshot` (monthly head counts per legal entity,
  `people/workforce.service.ts`), `HomeSnapshot` (monthly Home card counts), `SdReport` and `SdReportSchedule`
  (Helpdesk only), `AiCreditUsage`.
- Gender is on the person (`gender`, class personal); disability declarations exist (Special, PPL-38). Learning and
  Assess are not built in YukthiX (`yx-nav.test.ts` line 25), so the L&D and Proctoring admin templates have no
  YukthiX data.

## 4. Design groups, story by story

### A. Home and dashboards (ANL-01 to ANL-03)

#### ANL-01 · Analytics home

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Mine, shared, templates, library | design only, feature not built | no dashboards, sharing, templates or library exist (section 3); the menu hides Analytics (`yx-nav.test.ts` line 25) |
| FirstUse · First use (empty) | design only, feature not built | as above |

#### ANL-02 · Role dashboards

| story (sub-page) | verdict | note |
|---|---|---|
| Executive · Executive | design only, feature not built | headcount exists monthly (`WorkforceSnapshot`) and payroll cost in PAY-25, but attrition has no definition or data anywhere (section 3) and the trend needs daily history |
| Hr · HR | design only, feature not built | joiners and leavers are on Home (`/workspace/home`), but attrition by department and tenure bands need the metric layer |
| Payroll · Payroll and finance | wire design | gross, net and statutory due come from the Finance Home (`FinanceHome.runs`, `dues` in `workspace.service.ts`) and PAY-25 (`variance` report); the variance "by reason" split and the pay guard per entity come with them. Must still be registered as metrics (YX-MET-01) |
| Recruiter · Recruiter | wire design | funnel, time to hire, hires by source from `GET /analytics/hiring` (`analytics/pipeline-analytics.service.ts`, on the same `pipeline_entries` YukthiX Hiring uses); cost per hire from `/hiring/costs/overview`. Gap: offer acceptance and 90-day retention by source have no API |
| DepartmentHead · Department head (suppressed group) | design only, feature not built | needs cost by location with small groups hidden for a viewer without pay access; no such key or setting (questions 1362, 1364) |
| Manager · Manager | design only, feature not built | "Needs your action" is live on the manager Home (`RoleHomeScreen`); team attendance trend, goals on track and "High attrition risk" (wave 6, YX-MET-16) are not built (question 1372) |
| ComplianceOwner · Compliance owner | design only, feature not built | statutory dues exist (`FinanceHome.dues`, `statutory.filing.view`), but filings due or late, missing statutory IDs and registers generated have no single API |
| LearningAndDevelopment · L&D | design only, feature not built | Learning is not built in YukthiX (question 1365) |
| HelpdeskLead · Helpdesk lead | live (gap) | `/yx/desk/reports`, `SlaDashboardScreen`: open tickets, SLA %, first response, happy ratings, volume (`service-desk/reports.service.ts` KPIs `first_response_h`, `csat_pct`). Gap: not an Analytics template and not through the metric layer (question 1366) |
| Ethics · Ethics officer / IC (counts only) | design only, feature not built | cases and speak-up exist, but no counts-only API for an ethics viewer |
| StaffingHead · Staffing head | design only, feature not built | placements, bench, invoices and receivables pages are live, but there is no summary API (bench count, margin per placement) |
| Expenses · Finance · expenses | wire design | claims to pay and amount (`FinanceHome.claims`), oldest claim (`unpaid`), out-of-policy (`over-limit`) and by category (`summary`) from `GET /expenses/reports/:kind` |
| SystemAdmin · System Admin operations | design only, feature not built | login activity is live (`/yx/admin/login-activity`); weekly active users, failed jobs, integration errors and set-up % have no API |
| ProctoringAdmin · Proctoring admin | design only, feature not built | Assess is not in YukthiX yet; the exam app's `/dashboard/*` has attempt counts but no fairness, incident or review-time measures (question 1365) |
| Dei · Diversity, equity & inclusion | design only, feature not built | needs self-ID, pay-gap metrics and hiding for every viewer (YX-MET-14); company-enabled (question 1377) |
| Loading · Loading | design only, feature not built | the loading state of a screen that is not built |
| ManagerPhone · Manager cards · phone (wave 6) | phone view, mobile app not built | P09 §4.8 defers mobile cards to wave 6; there is no mobile app (`apps/` has api, exam-runtime, ocr-worker, web) |

#### ANL-03 · Dashboard builder

| story (sub-page) | verdict | note |
|---|---|---|
| PickMetric · Widget wizard 1: metric | design only, feature not built | no metric registry, dashboards or widgets (section 3); the kit's `DashboardGrid` already edits and resizes |
| LockedMetric · Widget wizard 1: salary metrics locked | design only, feature not built | needs metric sensitivity checked against the pay guard (question 1364) |
| PickDimension · Widget wizard 2: dimension | design only, feature not built | dimensions come from the planner |
| PickPeriod · Widget wizard 3: period | design only, feature not built | comparisons need daily history (question 1376) |
| PickChart · Widget wizard 4: chart | design only, feature not built | the charts are all kit components (`components/charts`) |
| Grid · Editing grid | design only, feature not built | no saved dashboards |
| Share · Share dialog | design only, feature not built | sharing must render with each viewer's own scope (YX-MET-07); key `analytics.dashboard.build` does not exist (question 1363) |

### B. Explore, reports and metrics (ANL-04 to ANL-07)

#### ANL-04 · Metric explorer

| story (sub-page) | verdict | note |
|---|---|---|
| Breakdown · Breakdown | design only, feature not built | no planner (section 3) |
| Trend · Trend | design only, feature not built | needs daily snapshots |
| Table · Table | design only, feature not built | as Breakdown |
| Suppressed · Small groups suppressed | design only, feature not built | hiding exists only inside Performance (`perf.report.min_cell`); no Analytics setting (question 1362) |
| Loading · Loading | design only, feature not built | the loading state |

#### ANL-05 · Report builder

| story (sub-page) | verdict | note |
|---|---|---|
| Grouped · Grouped by department, locked columns | design only, feature not built | no saved reports for HR data. Helpdesk has a ticket-only custom report (`sd_reports`, `/desk/reports/custom`); it is Helpdesk's own design and stays. Locked columns must follow `employee-fields.ts` classes and the pay guard |
| WithChart · Chart on | design only, feature not built | as above |
| Ungrouped · Ungrouped | design only, feature not built | as above |
| Empty · No rows match | design only, feature not built | as above |

#### ANL-06 · Report library

| story (sub-page) | verdict | note |
|---|---|---|
| ByQuestion · Grouped by question | design only, feature not built | no library catalogue (APX-C lists 131 reports). Many entries already exist as area pages (section 2) and can simply open them (question 1368) |
| Favourites · Favourites | design only, feature not built | no favourites store |
| Search · Search | design only, feature not built | as ByQuestion |
| NoMatch · Search with no match | design only, feature not built | as ByQuestion |

#### ANL-07 · Metric catalogue

| story (sub-page) | verdict | note |
|---|---|---|
| Definition · Definition, owner, changelog | design only, feature not built | no metric registry or changelog (section 3) |
| CalculatedMetric · Calculated-metric builder | design only, feature not built | no `tenant_metrics`; the formula must allow only governed metrics and + - x / (YX-MET-11) |
| ReadOnly · All users (read-only) | design only, feature not built | as Definition |

### C. Schedules and Ask (ANL-08, ANL-09)

#### ANL-08 · Schedules and export log

| story (sub-page) | verdict | note |
|---|---|---|
| Schedules · Schedules | design only, feature not built | no Analytics subscriptions. Two engines exist: the weekly exam digest (`scheduled-reports.service.ts`, fixed 7 days, one per company) and Helpdesk schedules (`sd_report_schedules`, built per recipient's rights). Reuse the Helpdesk one (question 1367) |
| NewSchedule · New schedule (secure link for Confidential) | design only, feature not built | the rule "attach only when nothing Confidential, else a sign-in link; WhatsApp link only" (YX-MET-08) is drawn but not built; `reports/exporters` has CSV, XLSX (`exceljs`) and PDF (`pdfkit`) (question 1369) |
| ExportLog · Export log | design only, feature not built | exports are audited under about 25 action names and the audit API matches one exact action (`audit-query.service.ts` line 63); no export list with rows and sensitivity (question 1370) |
| Auditor · Auditor: export log only | design only, feature not built | an `auditor` role exists (`apps/api/src/rbac/roles.ts` line 16), but there is no log for it to read |

#### ANL-09 · Ask analytics

| story (sub-page) | verdict | note |
|---|---|---|
| Answer · Governed answer with definition | design only, feature not built | no Ask code (section 3); needs the planner first (YX-MET-10). The AI plumbing (`AiInvocationService`: company key, credit quota, spend record) is reusable (question 1371) |
| Refused · Refused: no salary access | design only, feature not built | refusal comes from the planner's pay check, not from the AI |
| Generating · Generating | design only, feature not built | the kit's `AssistantPanel` has the generating state |
| Empty · First question | design only, feature not built | as Answer |

## 5. What can be reused, and what is missing

Reuse (never a second version):

- **Security:** `forTenant` RLS, `EmployeeHistoryService.scopeFilter` (who sees whom, by date), employee field classes,
  the pay guard (`app_pay_entities`) as PAY-25 opens it, `suppress()` from Performance, `AuditService`.
- **History:** employee history (dated assignments, `EmployeeAssignment`), `WorkforceSnapshot` (monthly heads),
  `HomeSnapshot` and its daily BullMQ job (`workspace/home-snapshot.jobs.ts`) as the pattern for daily snapshots.
- **Area data:** PAY-25 reports, expense reports, time reports, performance reports, Helpdesk KPIs, hiring pipeline
  analytics and costs, Finance Home runs, dues and claims.
- **Delivery:** `reports/exporters` (CSV, XLSX, PDF), Helpdesk's per-recipient schedule engine, email, in-app
  notifications and WhatsApp (`apps/api/src/notifications`, `whatsapp`).
- **AI:** `AiInvocationService` (company key, credits, spend), the "names never go to the model" pattern.
- **Kit:** everything the nine screens use already exists (`DashboardGrid`, `StatCard`, charts with `minGroupSize`,
  `DataTable` grouping, `AssistantPanel`, `Timeline`).

Second versions to retire when building: none in YukthiX. The `/v2` exam pages (hiring analytics, exam dashboard,
weekly digest settings) retire once the Recruiter and Proctoring templates and Analytics schedules are live (question
1375).

Missing (to build): the metric registry and planner, daily snapshots and monthly aggregates, attrition and the other
workforce metrics, dashboards and widgets, saved reports, the report library catalogue, calculated metrics,
subscriptions run as each recipient, one export log, the Analytics small-group setting and pay-totals key, Ask
analytics.

## 6. Questions for the founder (before building)

1361. **Order.** *Suggested: build the metric layer first (definitions, the query engine, daily history, all the
      security rules), then dashboards, then reports, then schedules, then Ask analytics last, as the design decided
      (P09 Q8). Nothing on an Analytics screen is shown until it comes from the metric layer.*
1362. **Hiding small groups.** Only Performance hides small groups today, with its own setting (5 or 10). *Suggested: a
      company setting for Analytics, "smallest group shown", default 5, choices 3 to 10. It applies to charts, tables,
      exports and schedules for anyone who cannot see the individual records; for diversity, disability and surveys it
      applies to everyone, HR included. Performance keeps its own setting.*
1363. **Who may build dashboards.** *Suggested: a new key "Build dashboards", given by default to HR Admin, Payroll
      Admin, System Admin and department heads (through the role templates); the company can give it to others. Anyone
      can open a dashboard shared with them and sees only their own people.*
1364. **Pay numbers in Analytics.** Only payroll staff can read pay today. *Suggested: salary metrics follow payroll
      access per legal entity, as Payroll reports do. Add one key "See pay totals in analytics" (totals and breakdowns,
      never per person, small groups hidden), given by default to the Executive and department-head templates; the
      company can change who holds it. Everyone else sees salary metrics locked, as drawn.*
1365. **Templates for areas not built.** L&D and Proctoring admin have no YukthiX data yet. *Suggested: show a template
      only when the company has that product and the area is live; hide L&D and Proctoring admin until then.*
1366. **Helpdesk lead.** The live Helpdesk reports page already shows these numbers. *Suggested: keep the Helpdesk
      reports page as it is. The Helpdesk lead template reads the same Helpdesk numbers, so both always match.*
1367. **Helpdesk custom reports and schedules.** Helpdesk has its own (ticket-only), already built to send each person
      only what they may see. *Suggested: keep them. Analytics schedules use the same engine, widened to dashboards and
      reports, and Helpdesk schedules also appear in the Analytics schedules list.*
1368. **Area report pages.** Payroll, Time, Expenses, Performance, Visitors and Helpdesk each have a designed reports
      page. *Suggested: the Analytics report library lists them by question and opens the area's own page; no copy in
      Analytics.*
1369. **Sending scheduled reports.** *Suggested: as decided in the design: email and in-app; the file is attached only
      when it has no confidential data, otherwise the email carries a sign-in link; WhatsApp carries a link only. Each
      person receives only what they may see. A company setting "attach files to scheduled emails when allowed",
      default on.*
1370. **One export log.** Exports are recorded today under about 25 different names, so no single list exists.
      *Suggested: every export (from any area and from Analytics) also writes one export record: who, what, format, rows,
      sensitivity. The Export log shows it; an Auditor sees the log only. Kept as long as the audit log.*
1371. **Ask analytics and AI.** *Suggested: a company setting, default off, and it uses the company's own AI key and
      credits. The AI only turns the question into a metric request from the catalogue; YukthiX runs it with the asker's
      access and writes the answer from the result. No names, pay amounts or records ever go to the AI. Every question
      is recorded with who asked and the metric used.*
1372. **Attrition risk on the manager dashboard.** It is a later feature (wave 6). *Suggested: leave that card out of the
      Manager template until attrition risk is built; show the other cards now.*
1373. **Phone cards.** *Suggested: wait for the mobile app (wave 6), as decided.*
1374. **AI narrative in the monthly leadership digest.** *Suggested: later, after Ask analytics; a company setting,
      default off.*
1375. **Old exam-app analytics pages.** `/v2` still has hiring analytics, the exam dashboard and the weekly exam digest
      settings. *Suggested: retire them once the Recruiter and Proctoring templates and Analytics schedules are live; the
      weekly digest becomes an ordinary schedule on a template.*
1376. **History on day one.** *Suggested: build the daily history back from each person's dated job history to the
      company's go-live date, so trends work at once; pay figures only from approved payroll runs. A back-dated change
      rebuilds the days it touches.*
1377. **Diversity dashboard.** *Suggested: off until the company switches it on (company setting, default off); it uses
      only what people chose to declare, hides small groups from everyone, and pay-gap numbers need the pay-totals key.*

## 7. Build plan (slices, max 3 builders at once)

| slice | what | reuses | size | rough estimate |
|---|---|---|---|---|
| A-1 | Metric layer core: registry in code with golden tests, the query engine (metrics x dimensions x filters x period), RLS, `scopeFilter`, field classes, pay guard, small-group setting and pay-totals key, daily `snap_employee_day` and monthly pay and attendance aggregates with back-dated rebuild (1361 to 1364, 1376) | `forTenant`, `scopeFilter`, pay guard, `suppress()`, `HomeSnapshot` job pattern, employee history, `WorkforceSnapshot` | L | 18 days (2 builders) |
| A-2 | Metric catalogue and explorer: ANL-07 with calculated metrics (safe formula, sensitivity inherited) and ANL-04 | A-1 | M | 7 days |
| A-3 | Home and role dashboards: ANL-01 and ANL-02; register the metrics each template needs from Payroll, Hiring, Expenses, Helpdesk, Time, People, Staffing, cases; hide templates for unbuilt areas (1365, 1366, 1372, 1377) | A-1, area APIs in section 2, `DashboardGrid` | L | 14 days |
| A-4 | Dashboard builder: ANL-03 wizard, grid, share as each viewer, home dashboard per role (1363) | A-1, A-3 tables | M | 7 days |
| A-5 | Report builder and library: ANL-05 (base entities, locked columns, filters, group-by, chart, save, share) and ANL-06 (catalogue linking to the area pages, favourites, search) (1368) | A-1, exporters, area report pages | L | 10 days |
| A-6 | Schedules and export log: ANL-08 (subscriptions run as each recipient, link-only for Confidential, send-if-data, retry) and the one export record written by every export (1367, 1369, 1370, 1375) | Helpdesk schedule engine, exporters, notifications, audit | M | 7 days |
| A-7 | Ask analytics: ANL-09 behind a company setting; AI picks the metric request, YukthiX answers; credits and audit (1371) | A-1 planner, `AiInvocationService` | M | 6 days |

Order (at most three builders at once):

1. Wave 1: A-1 (two builders: one on history and aggregates, one on the query engine and security). About 9 working
   days. Everything else waits for it.
2. Wave 2: A-2, A-3 and A-5 together (three builders). About 14 working days (A-3 is the longest).
3. Wave 3: A-4, A-6 and A-7 together (three builders). About 7 working days.

Every slice draws any new state in the kit first, keeps RLS (new tables in the forced-RLS set), opens the pay guard
only as PAY-25 does, audits every export, and adds positive and negative tests and an e2e suite. The phone story
waits for the mobile app.

## 8. Total estimate

**69 builder-days of build** (18 + 7 + 14 + 7 + 10 + 7 + 6), about **83 builder-days with a 20% allowance** for the
verify pass, manual test write-ups and fixes (the same allowance the Projects map uses). With the waves above it is
about 9 + 14 + 7 = **30 working days end to end (6 to 7 weeks)**.

Why this size: unlike most areas, Analytics has no back end of its own to wire. The metric layer, daily history and the
security rules (scope, pay guard, small groups) are new and sit under every screen, so A-1 blocks everything and is
hard to split beyond two builders. The role templates then need metrics registered from eight areas. Why not more: the
kit already has every screen part, the areas already compute most numbers (section 2), exports and the per-recipient
schedule engine exist, and the AI plumbing exists.

**Analytics against Projects.** The Projects map (`docs/yukthix/projects-design-map.md` on `docs/yukthix-projects-map`,
read 12 Nov 2026 while still uncommitted, so its number may change) gives 42 builder-days of build, about 50 with the
same allowance, and about 26 working days end to end. **Projects finishes faster**: about 33 fewer builder-days and
about 4 working days sooner end to end (both are limited by one blocking first slice, so the calendar gap is smaller
than the effort gap). The reasons: Projects grows things that exist (timesheet projects, the staffing
invoice engine, the client portal, cost rates), while Analytics must first build its foundation, and its Recruiter,
Payroll and Expenses templates are the only parts that ride on existing APIs.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every story of
every `Screens/Analytics/` file has exactly one row, in file order, under the heading that is its title after the
prefix, with one of the five verdicts. Copied from `console-design-map.md`; only the prefix, the file and the total
label differ.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/analytics-design-map.md and checks that every
// story under Screens/Analytics/ has exactly one row, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const path = require('path');
const PREFIX = 'Screens/Analytics/';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const want = {};
for (const f of walk('packages/yx-ui/src').filter((f) => f.endsWith('.stories.tsx'))) {
  const src = fs.readFileSync(f, 'utf8');
  const t = /title:\s*'([^']+)'/.exec(src)?.[1];
  // Capital first letter only: lower-case exports would be sample props.
  if (t?.startsWith(PREFIX)) want[t.slice(PREFIX.length)] = [...src.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/analytics-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 44), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story file: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = l.split('|')[2].trim(); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story file with no rows: ' + h);
const all = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) };
for (const c of Object.values(counts)) for (const k in all) all[k] += c[k];
counts['All A-C'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```
