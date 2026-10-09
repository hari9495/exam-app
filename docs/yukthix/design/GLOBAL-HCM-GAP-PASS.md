# Global HCM gap pass: YukthiX vs Oracle Fusion Cloud HCM and Workday HCM

> **Status:** 📝 For founder review, 9 Oct 2026. Docs only, no product code.
> **Why:** YukthiX sells to the world, India first. The aim is the depth of Oracle and Workday with none of their weight: plain words, good defaults, guided setup, no consultants. This pass checks our designed and built modules against both, area by area, and says how we would offer each gap simply.
> **Scope:** 1 Core HR · 2 Time and absence · 3 Payroll architecture · 4 Onboarding and offboarding · 5 Global readiness. Country law is out of scope (that lives in P07 packs).

## Method

- **Public sources only.** Oracle: docs.oracle.com (Fusion Cloud HCM guides and readiness notes). Workday: public product pages, public datasheets (PDF) on workday.com, the public blog and newsroom. No login, no trial, no customer community content. Every gap row cites a source; the full URL list is in §9.
- **Clean-room.** All capabilities are described in our own words. No vendor text, screens, field names, data models or workflows are copied. Vendor feature names appear only as short source labels.
- **Where public material was thin** (honest list):
  - **Workday's admin guide** (doc.workday.com) is mostly behind a customer login. We did not open it. So Workday detail on multiple jobs, international assignments, time-off plan setup, payroll calculation and costing is thin; rows that rest only on Oracle say so.
  - The **Workday Journeys datasheet** sits behind a sales form; we used only the open product page.
  - **Languages:** neither vendor publishes a current, official list of supported UI languages that we could find.
  - **Oracle localisation:** no official list of countries with Oracle-run payroll was found. Workday's public datasheet names its own payroll countries (US, Canada, France, UK) and points to partners for the rest.
  - **Data residency:** Workday has public blog and press pages (EU, India). Oracle residency was not checked in depth (it is a general Oracle Cloud region topic, not an HCM guide).
  - The public Workday HCM datasheet is a 2022 document; features may have moved on.
- **Our side:** BACKEND-ROADMAP, P01, P02, P03, P06, P07, P21, M01 + M01-LIFECYCLE-BUILD-DESIGN, M02, M03 + M03-BUILD-DESIGN, P10 (connectors), P04 (languages), MARKET-COMPETITOR-ANALYSIS.
- **Columns in each gap table:** *India pilot* = must it exist for the India private pilot (**yes**) or can it wait (**later**). *Size* = S (days), M (one or two weeks), L (a month or more). Source short names are expanded in §9.

---

## 1. Core HR: person, employment, assignment, structures

### 1.1 What we already cover

| Capability (our words) | Where |
|---|---|
| One person record, several employments over time, dated assignment slices under each employment (location, department, designation, grade, manager, cost centres, type) | P01 §3, §4.4; YX-ORG-06, YX-ORG-07 |
| One person across roles (candidate, employee, alumnus, contract worker, consultant, vendor worker) with matching, merge and unmerge | P01 §4.5a; YX-ORG-26, YX-ORG-27 |
| Move to another legal entity = close one employment, open another, same person, with five transfer options (leave, service, code, settlement, salary) and an impact preview | P01 YX-ORG-11, YX-ORG-17; M01 §3.3 (continuity checklist E9) |
| Rehire on the same record with continuity options | P01 YX-ORG-19; M01 §3.5 rehire policy |
| Secondment / deputation / client-site posting without changing employer; host location drives calendar and state rules; cross-entity recharge | P01 YX-ORG-21; M01 §3.3 |
| Bulk restructure (merge, close entity) through one wizard | P01 YX-ORG-22; M01 §3.3 |
| Effective dating for every fact that matters: future-dated changes, rebasing, corrections that supersede (never delete), as-of and segment queries, profile "view as of date" | P06 §4, YX-HIS-01…15 |
| Legal entities with country, currency, financial year, data region; locations with timezone and holiday calendar; shared or entity-only structure masters | P01 §4.1–4.3; YX-ORG-15, YX-ORG-30 |
| Positions as dated objects with FTE, budget, vacancy, job-share; company picks position-based or job-based per entity (starter: job-based) | M01 §3.9 (B16, wave 5) |
| Worker categories (permanent, probation, fixed-term, intern, apprentice, consultant, deployed contractor, retired re-employed) with statutory defaults from the pack | P01 §4.3, YX-ORG-20 |
| Dotted-line managers; org chart as of any date | P01 §4.4; M01 §3.2 |
| Scoped settings that show where each value comes from | P01 §4.6, YX-ORG-12, YX-ORG-18 |
| Workforce-planning scenarios (headcount and cost forecast, compare, approve) | M01 §3.9 (B16) |

**Verdict:** our person → employment → dated assignment model already matches the useful core of both vendors (Oracle's split of work relationship and assignment; Workday's single model of people, organisations and assignments). The gaps are **hours**, **several jobs at once**, **several service dates**, **cross-border moves** and **drafting a reorganisation**.

### 1.2 Gaps

| # | Gap (our words) | Why it matters globally | India pilot | Size | The simple YukthiX way | Source |
|---|---|---|---|---|---|---|
| C1 | **Working hours and FTE on every job.** An assignment has no contracted hours or FTE %. Only positions carry FTE. | Part-time work is normal in the EU, UK, Australia and Singapore. Leave, pay, holidays and FTE headcount must pro-rate from contracted hours. Without it every part-timer is a manual workaround. | yes (light: one field, default full-time) | M | One field "Hours per week" on the job, defaulted from the location's normal week (e.g. 48 in India, 40 elsewhere). FTE % is computed, never typed. Leave accrual and pay pro-rate automatically; the impact preview shows the effect. A full-time company sees no change. | Oracle employment model options (OR-1, OR-2) |
| C2 | **Two jobs at the same time.** We allow one open employment per tenant at launch (P01 Q6). No second job in the same entity, and no job split across two entities. | Common in hospitals, universities, retail and groups (60 % in one entity, 40 % in another). Oracle supports several assignments; Workday's public material is thin here. | later | L | Keep it **off by default**. When on, the profile gets "Add another job". One job is always **primary** (it gives the manager, the login defaults, the main payslip). One payslip per entity. The data model already allows it (P01 Q6). | OR-1 ("multiple assignments" option) |
| C3 | **Several service dates.** We have one joining date per employment, and continuity options on transfer and rehire, but no named set of service dates. | Seniority, notice, long-service awards, benefits and severance often count from different dates (company start, employer start, continuous service). GCC end-of-service and EU notice rules need it. | yes | S | Three plain dates on the job card: **Company start**, **This employer start**, **Continuous service from**. Filled automatically from transfers and rehires (we already store the choices). HR may edit with a reason. Rules and reports pick a date by name. | OR-5 (seniority date rules at enterprise and employer level) |
| C4 | **Cross-border assignment (temporary).** Our host posting stays inside one country's rules; relocation cases are "Later" (P21 §1). No home vs host country view, no tax-residency day count, no allowance package. | International assignments (home country keeps the employment; host country needs permits, shadow payroll and allowances) are a core global case. Indian firms send staff to the GCC, UK and US. | later | M | Extend the existing host posting to a **host country**. One "Working abroad" card: dates, host entity, permits (P21 work authorisations), allowances as one-time pay lines, a day counter for tax residency, end-date reminders. Shadow payroll goes through the payroll connector (P10 YX-INT-12), not our engine. A permanent move stays a normal inter-entity transfer (already covered). | OR-3 (global transfer closes one work relationship, opens another); WD-1 (single global model). Workday assignment docs behind login. |
| C5 | **Draft a reorganisation on the org chart.** We have a bulk wizard and cost scenarios, but no way to move boxes in a draft chart, see the result, and apply it as one dated change. | Reorgs happen every year in every company. Workday sells staged reorgs as a highlight. Doing it in a spreadsheet and re-keying is the usual pain. | later | M | "Draft reorg" mode on the org chart: drag people and teams, rename, add a department. Live preview of who changes manager, cost centre and approver. Submit once (P03). On approval it becomes one P06 bulk change with letters. Nothing goes live until approved. | WD-1 (plan and stage reorganisations, then apply with mass actions) |
| C6 | **Extra grouping trees for reports.** We have department, location, entity, cost centre, grade. No company-defined grouping such as "Region" or "Business unit" that cuts across departments. | Global firms report by region and business line as well as by department. | later | S | One "Groupings" setting: the company names up to three extra trees (e.g. Region, Business unit). Each department or location is tagged once. Reports, filters and access scopes can use them. Built on P18 custom fields, no new engine. | WD-1 (group workers by several criteria) |
| C7 | **Collective agreements and works councils.** Union check-off exists (M03), but no "agreement" that sets pay and leave rules for a group, and no step to inform a works council. | In much of the EU most pay and time rules come from collective agreements, and some staffing events need works-council involvement. | later | M | Add **Agreement** as a settings scope (P01 §4.6): a named bundle of policy values (leave, OT, pay steps) attached to people. Add an optional **"Inform works council"** step type in P03 for exits and job changes, off by default. | WD-1 (collective agreements; works-council touch point for staffing events) |
| C8 | **Non-employee workers outside India.** India contract labour (M13) and consultants (M03) are designed. There is no light record for a freelancer, agency temp or EOR worker in another country. | Global companies mix employees and contingent workers; both need logins, assets, access and offboarding. | later | S | Reuse `person_roles`: one "Other worker" role with start / end, supplier (optional), manager, cost centre. They appear in the directory and org chart with a badge, get journeys and access, never enter payroll. | OR-6 (contingent and pending worker types); WD-1 (all worker types) |

### 1.3 Do not copy (core HR)

- **Several employment "models" chosen per legal employer at setup** (single assignment, with contracts, multiple contracts…) that are hard to change later. *Ours:* one model for everyone; a second job is a switch (C2).
- **Separate legal layers for HR, payroll and tax reporting** (legislative data group, payroll statutory unit, tax reporting unit). *Ours:* a legal entity plus its statutory registrations (P01 §4.1). Same power, one screen.
- **A payroll relationship that lives apart from the employment.** *Ours:* payroll reads the employment and assignment directly.
- **Three staffing models mixed per organisation.** *Ours:* job-based by default, position-based as an opt-in per entity (already decided, M01 B16).
- **Bulk-loader files as the main way to do transfers** (special flags and action codes). *Ours:* the transfer screen with options and preview; imports use the same plain fields.

---

## 2. Time and absence

### 2.1 What we already cover

| Capability (our words) | Where |
|---|---|
| Leave types with eligibility, accrual (upfront, monthly, quarterly, by days worked, reduced by LOP), pro-rata, rounding, sandwich, half-day and hourly leave, notice, max, block dates, attachments, negative balance, optional holidays, carry-forward, lapse, encashment | M02 A1, A2; YX-LV-01…15 |
| Paid / unpaid / partially paid leave; statutory leave from the pack (maternity etc.) | M02 A2 (items 1 and 7) |
| Long absence as a dated status (sabbatical, long LWP, maternity, disability) with accrual pause and return-to-work tasks | P06 §4.1 (E3); M01 §3.3; YX-LV-11 |
| Holiday calendar by work location; country holiday feeds with moving holidays | M02 L2; P21 YX-GLB-05 |
| Three attendance modes (punch, assumed present, timesheet) as a scoped setting | P01 §4.6; M02 B3, YX-AT-09 |
| Shifts, rotating rosters, weekly offs, swaps; overtime with thresholds, caps, pre-approval, comp-off; factory OT paid at the legal rate | M02 B2, Q7, decision of 9 Oct 2026 |
| Auto-rostering, open shifts, shift bidding with fairness and rest rules | M02 B9 (wave 6) |
| Basic timesheets and project time; payroll feed of approved hours by rate category | M02 B6, B7; M12 |
| Locks, muster, registers; payroll feed after the lock | M02 B5, B6; P08 |
| Balance projection ("what will my balance be on 1 Dec?") | M02 A2 |

**Verdict:** for India we are at or above both vendors. For other countries the gaps are **country leave entitlements**, **pay that steps down the longer an absence lasts**, **balances in hours** and **time rules beyond India's overtime law**.

### 2.2 Gaps

| # | Gap (our words) | Why it matters globally | India pilot | Size | The simple YukthiX way | Source |
|---|---|---|---|---|---|---|
| T1 | **Pay steps inside one leave type.** A leave type is paid, unpaid or partly paid as a whole. No "first 10 days at 100 %, next 20 at 50 %, then unpaid", and no rolling 12-month window. | Sick pay in the UK, EU, GCC and Singapore works this way. UAE sick-leave pay bands are already named in P07 §4.6, but the leave engine cannot hold them. | later (data shape in step 4) | M | One small **"Pay steps"** table in the leave type: day range → pay %. Window: leave year or rolling 12 months. Steps come from the country pack (law) or the company (above the law). The leave form shows "Days 11–15 at 50 %" before submit. | OR-7 (plan type for time that is granted, not earned, e.g. sick and maternity) |
| T2 | **Country leave packs.** Statutory leave templates exist for India only. | Each country has minimum annual leave, sick, parental and public-duty leave. A new country should start with these filled in. | later | M | Each P07 country pack ships **starter leave types** (law values locked; the company can be more generous). The "Add a country" guide (G6) creates them in one step. | WD-3 (leave plans for 200+ countries; absence engine shared with payroll) |
| T3 | **Balances in hours.** Leave can be taken by the hour, but balances and accruals are in days. | Part-timers and shift workers abroad accrue and take leave in hours. Depends on C1. | later | S | Leave type unit: **days** (default) or **hours**. Hours convert from the person's contracted hours (C1). The employee always sees both ("3 days = 24 h"). | OR-8 (absence units in hours or days on the time card) |
| T4 | **Time rule templates for other countries.** OT rules cover India (thresholds, caps, factory law). No ready rules for daily plus weekly OT, night / weekend premiums, unpaid meal-break deduction, or average-hours limits over several weeks. | US states, the EU working-time average over a reference period, and GCC shorter Ramadan hours all need these. | later | M | The country pack ships **time rule templates**; the company tunes them in the P19 rule builder (no code). Every computed day has an "Explain" link: "11 h worked − 1 h break = 8 normal + 2 OT". | OR-9, OR-10 (validation rules, then calculation rules for breaks, OT and premiums) |
| T5 | **Leave year from each person's joining date.** The anniversary leave year was deferred (M02 L1). | UAE, KSA and many US firms count leave from each joining anniversary. | later | S | Add "Each person's joining date" to the leave-year choice. Accrual and carry-forward run per person. Starter stays the financial year in India. | WD-3 (flexible calculation periods) |
| T6 | **Time cost to projects in payroll costing.** Project hours exist (M12) and a cost rate exists (M03 B1), but the payroll journal does not split a person's pay by the hours they booked. | Services and grant-funded firms must book labour cost to projects and funders. | later | M | Option per pay group: "Split cost by approved timesheet hours". The journal (P1) then splits each line by project share; no timesheet = default cost centre. | OR-16 (distribute payroll cost to projects by time-card hours) |
| T7 | **Leave on the time card.** Timesheet users enter work hours in one place and leave in another. | Hourly workers expect one weekly screen for work and absence. | later | S | On the weekly timesheet grid, a "Leave" row that files a normal leave request for that day. One screen, same rules. | OR-8; WD-4 (time tracking with absence integration) |

### 2.3 Do not copy (time and absence)

- **Formulas written in a programming-like language** for time and absence rules. *Ours:* the typed rule builder (P19) with starter templates.
- **A chain of processing profiles** (time periods + consumer sets + rule sets + groups) before a single time card works. *Ours:* attendance mode + shift + OT rule, set per scope, with defaults.
- **Absence, time tracking and scheduling as three separately licensed products.** *Ours:* one module, all included (D18).
- **Demand forecasting from outside data in 15-minute blocks with a schedule "score".** *Ours:* pattern rosters plus the B9 solver; enough for 50–5,000 people.
- **No ready absence plans at all**, everything built from scratch per country. *Ours:* starter leave types per country (T2).

---

## 3. Payroll architecture

### 3.1 What we already cover

| Capability (our words) | Where |
|---|---|
| Pay group = entity × frequency × calendar; regular and off-cycle runs; run lifecycle with readiness, freeze, pre-run checks, calculate, review, approve, lock, pay, publish, post | M03 §6; M03-BUILD §3, §9 |
| Statutory rules as dated data with a typed evaluator and versioned calculators; each line records its rule version; payslips can be reproduced | P07 §4.1–4.2; P06 YX-HIS-09; M03-BUILD §3.5, §8 |
| Country-pack framework designed for new countries (UAE WPS and gratuity, GCC variants, US 1099) | P07 §4.6 |
| Retro changes as arrears in the next run; payslips never edited | P06 §4.5; YX-HIS-08 |
| Mid-period changes as segments | P06 §4.6 |
| Global payroll / EOR connectors for countries without our pack: push HR data and inputs, pull payslips, totals, cost and journals | P10 YX-INT-12 (T17) |
| Multi-currency pay and payout with dated rates; split pay; country bank formats (IBAN, SEPA, NACHA, BACS, WPS) | P21 YX-GLB-08, YX-GLB-09 |
| Accounting journal to Tally, Zoho Books, CSV and an API; provisions as journals | M03 §4; M03-BUILD §11.7 |
| Cost-centre split by % on the assignment; cross-entity recharge report | P01 §4.4; YX-ORG-21 |
| Maker ≠ checker, step-up, masking | M03-BUILD §12 |

**Verdict:** the architecture has the right bones (rules as data, packs, reproducible runs, connectors). Oracle and Workday run their own payroll in only some countries and use partners elsewhere, which is the same strategy as ours. The gaps are **accounting depth**, **a no-code file for any provider**, **one cross-country view**, and **pay frequencies outside India**.

### 3.2 Gaps

| # | Gap (our words) | Why it matters globally | India pilot | Size | The simple YukthiX way | Source |
|---|---|---|---|---|---|---|
| P1 | **Ledger mapping for the journal.** The journal exports, but there is no rule table "which pay component goes to which ledger account, by department / cost centre / project", no override level, and no holding bucket for lines that do not map. | Every finance team needs payroll to land in the right accounts. Needed in India too (Tally ledgers). | yes | M | One **"Ledger mapping"** table: component type → account, with an optional override by cost centre or department (two levels only). Starter mapping per component type (earnings → salaries, employer PF → contributions…). Any line without an account goes to **"Not mapped yet"** and blocks posting with a "Fix" link. Retro lines post to the original period's accounts. | OR-15 (costing built from several levels, suspense account when no valid account) |
| P2 | **A plain file for any payroll provider.** Connectors are planned per partner, but a company whose provider has no connector has no standard export of "what changed since the last cut-off". | Most companies outside India already have a local payroll bureau. A clean change file lets them use YukthiX for HR on day one. | later | S | One **"Payroll changes" file** (CSV / XLSX) per pay group and cut-off: joiners, leavers, pay changes, bank changes, leave and attendance totals, one-time pay, each with its effective date. A review screen before sending. Results come back as a simple upload (payslip PDFs + totals) and feed the same reports as our own payroll. | OR-13 (extract for a third-party provider and re-import results); WD-7 (change-based connectors for any third-party payroll) |
| P3 | **One pay and labour-cost view across countries.** Each entity pays in its own currency; there is no tenant reporting currency to add them up. | Group finance wants total people cost by country, entity and month in one currency. | later | S | A tenant **reporting currency** with monthly rates from a named source (the same store as P21 YX-GLB-09). Pay reports get a "Show in reporting currency" toggle. Our own runs and partner results (P2) appear together. | WD-6 (global labour-cost dashboard in one place) |
| P4 | **Weekly, bi-weekly and semi-monthly pay.** Monthly is built; weekly and fortnightly are wave 5i; semi-monthly and 26-period years are not designed. | The US, UK, Australia, Canada and hourly workforces pay this way. | later | M | Pay frequency is a pay-group choice with a calendar generator (pay-date rule, cut-off). Annual amounts convert by the number of periods. Built with the first country pack that needs it. | OR-14 (payroll cycle run as flows per period) |
| P5 | **A written "what a country pack must contain" checklist.** P07 §4.6 lists needs per country, but there is no fixed contract: tax-year dates, balance types (year-to-date, quarter-to-date, per tax unit), payslip fields, filing formats, bank format, golden tests. | Without a fixed contract each new country becomes a custom project, which is exactly what Oracle and Workday customers pay consultants for. | later | S | One page in P07: the **pack contract** (the list above) plus a test kit. A pack is "live" only when every item is ticked (feeds the P21 gate table). | WD-1 (own payroll in a few countries, partners elsewhere); WD-6 |
| P6 | **Shadow payroll for people working abroad.** Not designed. | Needed when a home-country employee works in a host country (C4). | later | M | Do not compute it ourselves. Send the person's data to the host country's provider through P2 / P10 and pull back the tax figures as information lines. | OR-13; WD-7 |

### 3.3 Do not copy (payroll)

- **A cost-account structure with many levels and segment labels.** *Ours:* one mapping table, two levels, a "not mapped yet" bucket (P1).
- **A configurable flow designer for the payroll run.** *Ours:* one fixed, guided run with clear stages (already designed). Companies want a safe path, not a flow editor.
- **Formula code for pay elements.** *Ours:* the safe, typed formula language (M03-BUILD §7.2).
- **Dozens of certified partner connectors as the main answer.** *Ours:* one generic file (P2) plus a few connectors where customers ask (P10).
- **Our own payroll for every country.** Oracle and Workday do not do this either. *Ours:* own engine for India and the GCC packs already designed; partners elsewhere.

---

## 4. Onboarding and offboarding

### 4.1 What we already cover

| Capability (our words) | Where |
|---|---|
| One journey engine for joining, leaving and return-to-work: templates by entity / department / role, owners (HR, IT, admin, manager, new hire), due dates before or after the anchor date, dependencies, reminders, re-anchoring when the date moves | M01 §3.5; M01-LIFECYCLE-BUILD §7; YX-LC-13 |
| Mobile-first pre-boarding portal: welcome, forms, uploads, e-sign, bank, tax choice, statutory items; long pre-boarding for campus hires with touchpoints | M01 §3.5; M01-LIFECYCLE-BUILD §8.2 |
| Hand-off by person type (new, rehire, internal move, contractor); did-not-join, reneged, withdrawn, postponed | M01 §3.5 (D3) |
| BGV, letters, e-sign, verify page | M01 §3.5; M01-LIFECYCLE-BUILD §9 |
| Exit types, resignation flow, notice rules, exit pre-checks and holds, clearance, assets, exit interview, alumni access, deprovisioning, F&F hand-off | M01 §3.7, §3.8; M01-LIFECYCLE-BUILD §10, §11 |
| Link to service-desk journeys (IT / admin tasks) | M01-LIFECYCLE-BUILD §7.4 |
| Employee and manager assistants | P23 |

**Verdict:** our joining and leaving flows are deeper than what the public Oracle and Workday material shows, especially for India. Both vendors now push **journeys for every life event** and **a new-hire assistant**. That is our gap.

### 4.2 Gaps

| # | Gap (our words) | Why it matters globally | India pilot | Size | The simple YukthiX way | Source |
|---|---|---|---|---|---|---|
| O1 | **Journeys for other life events.** The engine allows custom journeys, but nothing starts them automatically on a promotion to first-time manager, a transfer, a relocation, parental leave or a return from it. No content steps (read a policy, watch a video, answer a short survey). | Both vendors present journeys as their main employee-experience tool. Cheap for us, the engine exists. | yes | S | A small **starter library** (new manager, transfer, parental leave, return to work, relocation), each linked to the P06 change type that starts it. Three new step kinds: **read and acknowledge**, **watch**, **quick survey**. Each journey is off until the company turns it on. | OR-17 (contextual, guided and survey journeys); WD-8 (journeys for onboarding, new managers, leave) |
| O2 | **A first day / week / month view for the new hire.** The pre-boarding portal ends at joining; after that, tasks sit in the general inbox. | A clear "your first 30 days" page is now expected and lowers early attrition. | yes | S | After joining, the home screen shows a **"Your first 30 days"** card from the same journey: today, this week, this month, with the manager and a buddy. It goes away when the journey ends. | WD-8 (onboarding welcome page with day, week and month steps) |
| O3 | **Journey reports.** No view of completion rate, overdue steps by owner, or time to finish per template. | HR needs to see which teams (often IT) delay new hires. | later | S | One report per template: % complete on day 1, overdue tasks by owner group, average days to finish. Uses P09 metrics, no new engine. | WD-8 (journeys usage dashboard) |
| O4 | **Country onboarding forms.** Pre-boarding forms and statutory tasks are India-specific (UAN, Form 11, ESIC). | Each country has its own new-hire forms and right-to-work checks. | later | S | The country pack ships a **starter onboarding template** (forms, documents, statutory tasks with due dates). Work authorisations (P21) plug in as a task. | WD-1 (contracts, offers and apprentice management as local features) |
| O5 | **New-hire questions answered inside the journey.** P23 assistants exist but are not tied to journey steps. | Oracle now ships an onboarding assistant that answers questions and nudges on open steps. | later | S | The P23 employee assistant reads the person's open journey and the company's policy pages; it answers "what do I bring on day 1?" and reminds about open steps. Uses AI credits (P10), off by default. | OR-19 (onboarding assistant, 25D readiness) |
| O6 | **Country exit rules.** End-of-service and notice rules are designed for India and the GCC (P07 §4.6). Other countries' minimum notice, severance and exit paperwork are not. | Every country has legal notice and severance floors. | later | M | Same pattern as India: the pack holds legal notice and severance; the exit case reads them; company policy can only be more generous. | OR-3 (end of a work relationship per legal employer) |

### 4.3 Do not copy (onboarding and offboarding)

- **Replacing the whole onboarding product with a new engine behind a hidden setting**, and retiring the old checklists in a later update. *Ours:* one journey engine from the start, no hidden switches.
- **One guided journey per configured action, set up through a separate page-design studio.** *Ours:* journeys start from change types; no screen designer.
- **Survey journeys as a second survey tool.** *Ours:* a "quick survey" step (O1); full surveys stay in M09 Engage.

---

## 5. Global readiness

### 5.1 What we already cover

| Capability (our words) | Where |
|---|---|
| Region catalogue (IN, UAE, KSA, EU, US, SG), data region per legal entity, in-country hosting for UAE / KSA, multi-region tenants, region move with deletion certificate | P21 YX-GLB-10, YX-GLB-11; P01 YX-ORG-30; P02 YX-SEC-37, YX-SEC-38 |
| Gate table: a country is sold only when its pieces are live | P21 §5a, YX-GLB-01 |
| Arabic / RTL, Arabic-Indic digits and Hijri as display choices, bilingual GCC templates | P21 YX-GLB-02…04 |
| Names, addresses, phones in global formats; gender list | P01 YX-ORG-28, YX-ORG-29 |
| Work permits and national IDs that drive filings and pre-flight | P21 YX-GLB-06, YX-GLB-07 |
| Bank formats and multi-currency payout | P21 YX-GLB-08, YX-GLB-09 |
| Holiday feeds per country | P21 YX-GLB-05 |
| E-invoicing for KSA, UAE, EU | P21 YX-GLB-12 |
| Employee-facing UI and notifications in English, Hindi, Tamil, Telugu; message catalogue enforced in CI | P04 Q4 and decisions |
| Privacy: India DPDP first, GDPR kept; versioned notices per locale | P02 §6 |
| Law as dated data; no country constant in code | P07; YX-GLB-16 |

**Verdict:** on data residency we are ahead of what both vendors show publicly (data region per legal entity; GCC in-country). Workday's public material shows EU-hosted data, an opt-in EU-only support access policy, and an India data centre announced for 2026. Our gaps are **language reach**, **translating company content**, **country-specific person fields**, **support access by region**, and a **guided "Add a country" path**.

### 5.2 Gaps

| # | Gap (our words) | Why it matters globally | India pilot | Size | The simple YukthiX way | Source |
|---|---|---|---|---|---|---|
| G1 | **Company content in several languages.** UI strings are translated, but the company's own words (leave type names, job titles, custom field labels, journey steps, policy text) exist in one language. | A Tamil-speaking worker sees Tamil screens but English leave names. Abroad, every multi-country company needs this. | yes (Hindi / Tamil / Telugu labels) | M | Every name a company types gets an optional **"Translate"** link with one box per enabled language. A missing translation falls back to the company default. An export / import file lets a translator do all labels at once. AI draft translation as an option (credits). | OR-20 (languages added across the application; current list not public) |
| G2 | **More UI languages.** English, three Indian languages, Arabic planned. No European or East Asian languages. | Every EU, LATAM or Japan customer will ask. | later | M per language | Add a language only with the first customer in that country (a P21 gate item). Strings are already in a catalogue, so the work is translation and review, not code. | Public lists thin for both vendors; WD-1 (profiles for 200+ countries) |
| G3 | **Country field sets on the person.** Identity and diversity fields are India-shaped. No rule for which IDs and which equality fields are required, allowed or forbidden per country. | A field can be required in one country and unlawful to ask in another (ethnicity is reported in some countries and restricted in others). | later | M | The country pack lists **person fields**: required, optional or **not allowed**. The profile shows only what the person's work country allows. A forbidden field cannot be added as a custom field for that country. | WD-1 (country-specific diversity and compliance fields on the profile) |
| G4 | **Support access from the customer's region only.** YukthiX staff support sessions (P02) have no region limit. | EU and GCC buyers ask "who can see our data, and from where?". Workday offers opt-in EU-only and US-only support access. | later | S | A tenant setting **"Support from my region only"**. Support sessions are then granted only to YukthiX staff tagged to that region; the audit log shows it. | WD-10 (support access policies) |
| G5 | **Retention rules per country.** DPDP retention is designed; GDPR rights are "kept", but per-country retention periods are not pack data. | Retention periods differ by country (pay, tax, health records). | later | S | Retention per record type becomes pack data with the law cited; the existing erasure job reads it. | WD-1 (GDPR tools); WD-9 (EU data commitment) |
| G6 | **A guided "Add a country" setup.** The P21 gate checks readiness on our side, but there is no guided flow for the customer: create the entity, pick the data region, holidays, starter leave, onboarding template, payroll mode. | Country setup is a large part of consultant cost in Oracle and Workday projects (many setup tasks per legal entity and payroll unit). Doing it in 20 minutes is our clearest selling point. | yes (the same flow sets up India) | M | One **"Add a country"** guide, six steps with defaults from the pack: entity and registrations → data region → holiday feed → starter leave (T2) and time rules (T4) → onboarding and exit templates (O4, O6) → payroll: **YukthiX payroll** (if the pack is live) / **my provider** (P2 file or connector) / **none yet**. Ends with a list of what is still open. | OR-11, OR-12 (legal employer, payroll statutory unit and tax reporting unit setup) |

### 5.3 Do not copy (global readiness)

- **Language packs requested per environment** and installed by the vendor. *Ours:* every language we ship is always there; the company switches it on.
- **Separate addenda and support cases to get region-only support.** *Ours:* one setting (G4).
- **Country localisations sold as add-ons.** *Ours:* country packs are included (D18); only third-party pass-through costs extra.

---

## 6. Top 15 gaps worth adding (ranked)

Ranked by value to the India pilot first, then value for the first customer outside India, then size (smaller first when value is equal).

| Rank | Gap | Area | India pilot | Size | One-line reason |
|---|---|---|---|---|---|
| 1 | **C1** Working hours and FTE on every job | Core HR | yes | M | Leave in hours, part-time pay and FTE reports all depend on it; cheapest before step 4 is built. |
| 2 | **P1** Ledger mapping with a "not mapped yet" bucket | Payroll | yes | M | Indian customers will judge payroll by whether Tally / Zoho Books postings are right. |
| 3 | **G6** Guided "Add a country" setup | Global | yes | M | Our "no consultants" promise made visible; the same flow sets up India. |
| 4 | **O1** Life-event journeys (new manager, transfer, parental leave) with read / watch / survey steps | Onboarding | yes | S | The engine exists; small effort, big visible gain. |
| 5 | **C3** Three named service dates | Core HR | yes | S | Gratuity, notice and awards across transfers and rehires already need it in India. |
| 6 | **G1** Translate company content (labels, leave names, journeys) | Global | yes | M | Makes the Hindi / Tamil / Telugu promise real for workers. |
| 7 | **O2** "Your first 30 days" card | Onboarding | yes | S | Cheap, visible, lowers early attrition. |
| 8 | **T1** Pay steps and rolling windows in a leave type | Time | later (shape now) | M | Needed for UAE sick leave (already in P07) and every EU / UK customer. |
| 9 | **P2** Plain "payroll changes" file and results upload | Payroll | later | S | Any company abroad can use us for HR on day one, without a connector. |
| 10 | **T2** Starter leave types per country pack | Time | later | M | Turns a new country from a project into a click. |
| 11 | **G3** Country person-field sets (required / optional / not allowed) | Global | later | M | Legal safety abroad; stops forbidden questions. |
| 12 | **T4** Time rule templates (daily / weekly OT, premiums, average-hours limits) | Time | later | M | Needed for any hourly workforce outside India. |
| 13 | **P3** Reporting currency across entities | Payroll | later | S | Group finance view; small on top of P21 rates. |
| 14 | **C5** Draft reorg on the org chart | Core HR | later | M | A yearly pain in every mid-size company; Workday sells it as a highlight. |
| 15 | **C4** "Working abroad" card (shadow payroll through partners) | Core HR | later | M | Indian companies sending staff to the GCC, UK and US will ask early. |

**Next in line (not in the top 15):** C2 two jobs at once (L), C7 collective agreements and works councils, P4 pay frequencies, P5 pack contract, T3 balances in hours, T5 anniversary leave year, T6 time-based cost split, T7 leave on the time card, C6 extra grouping trees, C8 non-employee workers abroad, O3 journey reports, O4 country onboarding forms, O5 journey assistant, O6 country exit rules, G2 more UI languages, G4 region-only support, G5 retention per country, P6 shadow payroll.

---

## 7. Decisions for the founder

Short questions. Each has options. The recommended default is in **bold**.

1. **Part-time hours.** Should every job have "hours per week"?
   - A: **Yes, in step 4 (time and leave). Default is full-time, so nobody sees a change.**
   - B: Later, with the first customer abroad.
   - *Why A:* adding it after leave and payroll are built means redoing both.

2. **Two jobs at once.** Keep "one job per person" at launch?
   - A: **Yes, keep it off. Build it when a customer needs it. The data model is ready.**
   - B: Build it now.

3. **Ledger mapping in the India pilot.** Build the pay-to-accounts mapping in step 5?
   - A: **Yes, simple version: two levels and a "not mapped yet" bucket.**
   - B: Export only; the accountant maps in Tally.

4. **Payroll outside India.** How do we pay people in other countries first?
   - A: **Partners first: a plain change file for any provider, then connectors when asked. Our own engine only for UAE / GCC (already designed).**
   - B: Build our own payroll country by country.
   - C: No payroll abroad at all.

5. **Next country after India.** Which country do we prepare first?
   - A: **UAE (packs, Arabic and hosting are already designed in P21).**
   - B: Singapore.
   - C: UK.
   - D: Wait for the first real customer.

6. **"Add a country" guide.** Build the guided setup for the India launch?
   - A: **Yes. India uses the same guide, so there is no extra work later.**
   - B: Only when the second country comes.

7. **Translating company words.** Let companies translate their own labels (leave names, job titles, journeys)?
   - A: **Yes, now, for Hindi, Tamil and Telugu.**
   - B: Later.

8. **More UI languages.** When do we add European or other languages?
   - A: **Only with the first paying customer in that country (a P21 gate item).**
   - B: Add French, German and Spanish now.

9. **Sick pay that steps down.** Build "pay steps" in leave types in step 4?
   - A: **Build the data shape in step 4; show the screen when the first UAE or foreign customer comes.**
   - B: Build it fully now.
   - C: Later.

10. **Life-event journeys.** Ship a small library (new manager, transfer, parental leave, return to work)?
    - A: **Yes, in step 6 with onboarding. Each one is off until the company turns it on.**
    - B: Later.

11. **Working abroad.** When do we design cross-border assignments?
    - A: **After the first GCC customer signs.**
    - B: Now.

12. **Unions and works councils.** Add collective agreements and a works-council step?
    - A: **Later, with the first EU customer.**
    - B: Now.

13. **Support from the customer's region only.** Offer this setting?
    - A: **Yes, before the first EU or GCC customer (small).**
    - B: Only on request.

---

## 8. What this pass does not change

- No founder decision is changed. Every row is a proposal.
- No build slices or stories are created here. If the founder agrees, gaps go into the owning docs (P01, M01, M02, M03, P07, P10, P21) and the GAP-REGISTER, as with the Zoho Desk pass.

## 9. Sources (public only)

**Oracle (docs.oracle.com)**

| ID | Page |
|---|---|
| OR-1 | Employment model: https://docs.oracle.com/en/cloud/saas/human-resources/24b/faigh/employment-model.html |
| OR-2 | When to select the employment model: https://docs.oracle.com/en/cloud/saas/human-resources/faigh/when-to-select-the-employment-model.html |
| OR-3 | Global transfer (HCM Data Loader): https://docs.oracle.com/en/cloud/saas/human-resources/fahbo/how-you-perform-a-global-transfer-using-HCM-data-loader.html |
| OR-4 | Worker work relationship overview: https://docs.oracle.com/en/cloud/saas/human-resources/24a/faiau/overview-of-worker-work-relationship.html |
| OR-5 | Seniority dates and pending workers: https://docs.oracle.com/en/cloud/saas/human-resources/faigh/how-can-i-exclude-pending-workers-from-the-seniority-dates.html |
| OR-6 | Employment lookups (worker types): https://docs.oracle.com/en/cloud/saas/human-resources/faigh/employment-lookups.html |
| OR-7 | Absence plans (US): https://docs.oracle.com/en/cloud/saas/human-resources/faaua/set-up-absence-plans-for-the-us.html |
| OR-8 | Absence with Time and Labor: https://docs.oracle.com/en/cloud/saas/human-resources/faitc/set-up-absence-management-to-integrate-with-time-and-labor.html |
| OR-9 | Time validations and calculations: https://docs.oracle.com/en/cloud/saas/human-resources/faitp/about-implementing-time-validations-calculations-and-processing-in-time-and-labor.html |
| OR-10 | Time formula and rule types: https://docs.oracle.com/en/cloud/saas/human-resources/24d/faitl/time-formula-and-rule-types.html |
| OR-11 | HCM organisation models for payroll: https://docs.oracle.com/en/cloud/saas/human-resources/faipb/examples-of-hcm-organization-models-for-payroll.html |
| OR-12 | Define legal entities for Global Payroll: https://docs.oracle.com/en/cloud/saas/human-resources/faipb/define-legal-entities-for-global-payroll.html |
| OR-13 | Global Payroll Interface overview: https://docs.oracle.com/en/cloud/saas/human-resources/24c/oapnt/overview-of-global-payroll-interface.html |
| OR-14 | Global Payroll for the US overview (payroll flows): https://docs.oracle.com/en/cloud/saas/human-resources/24d/faaus/overview-of-using-oracle-fusion-global-payroll-for-the-us.html |
| OR-15 | Payroll costing load overview: https://docs.oracle.com/en/cloud/saas/human-resources/23d/fahbo/overview-of-loading-payroll-costing.html |
| OR-16 | Payroll costing with other applications: https://docs.oracle.com/en/cloud/saas/human-resources/faipc/how-payroll-costing-components-integrate-with-other-applications.html |
| OR-17 | Journeys overview: https://docs.oracle.com/en/cloud/saas/human-resources/24c/faigh/overview-of-journeys.html |
| OR-18 | Checklists and onboarding replaced by journeys (24B readiness): https://docs.oracle.com/en/cloud/saas/readiness/hcm/24b/hure-24b/24B-hr-wn-f31385.htm |
| OR-19 | Onboarding assistant (25D readiness): https://docs.oracle.com/en/cloud/saas/readiness/hcm/25d/hure-25d/25D-hr-wn-f41175.htm |
| OR-20 | Language packs (older 11g guide): https://docs.oracle.com/cd/E29597_01/fusionapps.1111/e16602/langpack.htm |
| OR-21 | Workforce scheduling overview: https://docs.oracle.com/en/cloud/saas/human-resources/24a/faigh/overview-of-workforce-scheduling.html |

**Workday (public pages and datasheets)**

| ID | Page |
|---|---|
| WD-1 | HCM datasheet (2022, UK): https://www.workday.com/content/dam/web/uk/documents/datasheets/datasheet-workday-human-capital-management.pdf |
| WD-2 | Organisation management datasheet (staffing models): https://www.workday.com/content/dam/web/uk/documents/datasheets/organization-management-in-workday-datasheet.pdf |
| WD-3 | Absence management datasheet: https://www.workday.com/content/dam/web/en-us/documents/datasheets/workday-absence-management-datasheet-en-us.pdf |
| WD-4 | Time tracking datasheet: https://www.workday.com/content/dam/web/en-us/documents/datasheets/datasheet-workday-time-tracking.pdf |
| WD-5 | Scheduling page: https://www.workday.com/en-us/products/workforce-management/scheduling.html · labour optimisation datasheet: https://www.workday.com/content/dam/web/en-us/documents/datasheets/workday-labor-optimization-enus.pdf |
| WD-6 | Global payroll and integrations page: https://www.workday.com/en-us/products/payroll/global-payroll.html |
| WD-7 | Cloud Connect for Third-Party Payroll datasheet: https://blog.workday.com/content/dam/web/en-us/documents/datasheets/datasheet-workday-cloud-connect-third-party-payroll.pdf |
| WD-8 | Employee experience (Journeys) page: https://www.workday.com/en-us/products/human-capital-management/employee-experience.html |
| WD-9 | EU customer commitment (data location): https://blog.workday.com/en-us/our-commitment-to-our-european-customers.html · India data centre (press, July 2025): https://en-sg.newsroom.workday.com/2025-07-03-Workday-Deepens-India-Commitment-with-New-Local-Data-Center-and-Expanded-Team |
| WD-10 | Support access policies: https://community-content.workday.com/en-us/public/get-help/support/access-policies.html |

**Not used:** third-party training blogs and course outlines that showed up in searches; Workday's admin guide (login); the Workday Journeys datasheet (behind a sales form).
