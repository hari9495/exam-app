# YukthiX — Phase 3 Design Docs

> **What this folder is.** YukthiX's **own** design: data model, rules, flows and tests. It is written after the Frappe reference (Phase 1, `reference/frappe-hrms-functional-spec/`) and the scope decisions (Phase 2, `spec.md` §5).
> **Clean-room:** these docs describe *our* design. They cite Frappe rule IDs and UI issues (U-numbers) only as test inputs ("do not repeat defect X"). They never copy Frappe code, identifiers or wording.

## Ground rules (from earlier decisions)

| Rule | Source |
|---|---|
| TypeScript: Next.js + NestJS + **PostgreSQL** + Prisma + BullMQ/Redis | D2, D10 |
| **One codebase:** HRMS lives in the exam-app monorepo (`D:\exam app`), extending its platform | D11 |
| Shared DB, **tenant key on every row + Postgres RLS** | D3 |
| India first, but no India-only assumptions in the core (country packs) | D5 |
| Everything is in launch scope; P0/P1/P2 is build order only | D7 |
| UI per the [UI design brief](../reference/frappe-hrms-functional-spec/99-ui-design-brief.md) | D13 |

## Order (gap summary §8)

| # | Doc | Covers | Status |
|---|---|---|---|
| **P01** | [Tenancy & organisation model](P01-tenancy-and-organisation.md) | Tenant → legal entity → location; departments, designations, grades, cost centres; employee identity & assignments; scoped settings; Postgres RLS | ✅ Decided (8/8), 24 Sep 2026 |
| P02 | [RBAC, data visibility & privacy](P02-access-visibility-privacy.md) | Data-driven roles (employee, manager, HR, payroll, finance…), scopes (self / team / entity / all), field sensitivity, small-group suppression | ✅ Decided (8/8), 24 Sep 2026 |
| P03 | [Workflow & approval engine](P03-workflow-approval-engine.md) | Registered request types, conditional multi-level chains, delegation, SLA, approval cards | ✅ Decided (8/8), 24 Sep 2026 |
| P04 | [Notification engine](P04-notification-engine.md) | Events → templates → channels (in-app, email, WhatsApp, SMS, push), languages, digests | ✅ Decided (8/8), 24 Sep 2026 |
| P05 | [Letters, documents & e-sign](P05-letters-documents-esign.md) | Templates, generation, storage, expiry, employee document vault | ✅ Decided (8/8), 24 Sep 2026 |
| P06 | [Effective-dated history & scheduled changes](P06-effective-dated-history.md) | Assignment / compensation history, future-dated changes, "as on date" queries | ✅ Decided (8/8), 25 Sep 2026 |
| P07 | [Statutory rules as dated data](P07-statutory-rules-as-data.md) | Country packs: slabs, rates, calendars, minimum wages, by effective date | ✅ Decided (8/8), 25 Sep 2026 |
| P08 | [Period locks & audit](P08-period-locks-and-audit.md) | Attendance/payroll locks, re-open with reason, audit log extension | ✅ Decided (8/8), 25 Sep 2026 |
| P09 | [Metric layer & analytics platform](P09-metric-layer-analytics.md) | Governed metrics, daily snapshots, report builder base (see `11-analytics.md`) | ✅ Decided (8/8), 25 Sep 2026 |
| P10 | [AI layer & integration hub (HR additions)](P10-ai-layer-integration-hub.md) | OCR, face check-in reuse, biometric/bank/accounting/BGV connectors | ✅ Decided (8/8), 25 Sep 2026 |
| **P11** | [API-first (headless) architecture](P11-api-first-headless.md) | One versioned public API for all clients; OpenAPI, scoped keys, OAuth, webhooks, idempotency, developer portal, sandbox, embeddables | ✅ Decided (8/8), 25 Sep 2026 · TR1 for team review |
| **P12** | [Identity, authentication & security programme](P12-identity-security.md) | MFA & step-up, SSO / SCIM, sessions, login protection, keys & encryption, secure SDLC, pen testing, incident response, staff access, certifications | ✅ Decided (8/8), 26 Sep 2026 |
| P13 | [Infrastructure & operations — team brief](P13-infrastructure-operations-TEAM-BRIEF.md) | Cloud, compute, availability, backups / DR, regions, monitoring & on-call, release process, testing strategy | ⏸ Parked for the engineering team, 26 Sep 2026 |
| **P14** | [Billing, tenant lifecycle & platform console](P14-billing-tenant-lifecycle.md) | Products & add-ons, metering, GST invoices, payments, dunning, trial, cancellation & export, deletion, platform console, support | ✅ Decided (8/8), 26 Sep 2026 |
| **P15** | [Migration, implementation & sandbox](P15-migration-implementation-sandbox.md) | Import framework (templates, mappers, validate, preview, rollback), history import, parallel run, implementation playbook, pilot exit criteria, tenant sandbox, demo data | ✅ Decided (6/6), 26 Sep 2026 |
| **P16** | [Partner & accountant console](P16-partner-accountant-console.md) | CA firms, payroll bureaus, resellers, implementation partners: client links and grants, client- or partner-owned tenants with transfer, cross-client compliance dashboard, operator roles, billing and commission, partner directory | ✅ Decided (6/6), 26 Sep 2026 |
| **P17** | [Global search & command palette](P17-global-search.md) | Permission-aware search across records, Ctrl/Cmd-K actions, Indian-name phonetics, multilingual | ✅ Decided by principle, 26 Sep 2026 |
| **P18** | [Custom objects & form builder](P18-custom-objects-form-builder.md) | Tenant custom objects, fields, layouts, APIs and webhooks, custom request types and reports (wave 6) | ✅ Decided by principle, 26 Sep 2026 |
| **P19** | [Policy rule builder](P19-policy-rule-builder.md) | One rule language for the whole product: policy values, eligibility, validation, routing, automations, layout conditions, formulas; any built-in or custom field; law guard; impact preview; versioning (D19) | ✅ Decided (6/6), 26 Sep 2026 |
| **P20** | [Growth, trial & customer operations](P20-growth-trial-customer-operations.md) | Quick start lane per product (5-minute first value), trial-to-paid journey (nudges, "switch on" moments, talk to us, extensions), public help centre, incident and maintenance message templates, growth use of product analytics (validation pass 3 S1–S3, S10, S11) | ✅ Decided (5/5), 28 Sep 2026 |
| **P21** | [Global readiness](P21-global-readiness.md) | Region gate table; Arabic / RTL, holiday feeds, names and addresses, visas / permits / IDs, IBAN / SEPA / NACHA / BACS and split pay, region catalogue with in-country residency, multi-region tenants and region move, KSA / UAE / EU e-invoicing, Emiratisation / Nitaqat / GOSI / WPS, Singapore, EU whistleblower timings (validation pass 3 G1–G5, G9, G10, R16–R18, S16, T18) | ✅ Decided by founder 28 Sep 2026: design now, build before the first customer in each region |
| **P22** | [Workflow Studio & AI assistant](P22-workflow-studio-ai-assistant.md) | Multi-step no-code workflows extending P19 (triggers incl. inbound email and signed webhooks, waits, loops, approvals, error handling, gallery, undo, limits, kill switch), sandboxed script step (wave 6), AI assistant that drafts workflows and runs approved plans (wave 5) | ✅ Decided (3/3), 28 Sep 2026 |
| **P23** | [Employee & manager assistants, marketplaces](P23-employee-manager-assistants-marketplaces.md) | Payslip explainer, employee tax planner, salary structure optimiser (wave 3); AI policy & handbook writer, timesheet auto-fill (calendar / Jira / GitHub), AI manager coach, review assistant with bias check, group insurance via IRDAI-licensed partner, employee perks marketplace (wave 5) | ✅ Decided (founder selected 9 features), 28 Sep 2026 |
| **M01** | [Core HR & employee lifecycle](M01-core-hr-and-lifecycle.md) | Employee record, org chart, job changes, probation, onboarding + pre-boarding, assets, offboarding, F&F, succession | ✅ Decided (8/8), 25 Sep 2026 |
| **M02** | [Leave & attendance](M02-leave-and-attendance.md) | Leave types, ledger, accrual, sandwich, comp-off, year-end; punches, shifts, rosters, weekly offs, day engine, OT, regularisation, muster, payroll feed | ✅ Decided (7/7), 25 Sep 2026 |
| **M03** | [Payroll & India statutory](M03-payroll-and-statutory.md) | Components, CTC templates, compensation, payroll run with validation/variance/approval, payslips, one-time pay, loans, tax workspace (regime, declarations, proofs, 12B), PF/ESI/PT/LWF, TDS challans, 24Q, Form 16, bonus, gratuity, bank files, journals | ✅ Decided (8/8), 25 Sep 2026 |
| **M04** | [Mobile app](M04-mobile-app.md) | PWA + store apps, tabs Home/Time/Requests/Pay/Me, manager mode, sign-in, device binding, kiosk, offline, WhatsApp actions, re-auth | ✅ Decided (8/8), 25 Sep 2026 |
| **M05** | [Expenses, advances & travel](M05-expenses-advances-travel.md) | Categories, policies (limits, mileage, per diem), claims with OCR receipts, GST, duplicate checks, trips, advances & settlement, payment routes, corporate cards | ✅ Decided (8/8), 25 Sep 2026 |
| **M06** | [Performance](M06-performance.md) | OKRs/KPIs with cascade, check-ins, staged review cycles, 360°, rating scales, calibration & 9-box, comp review, PIP, competencies | ✅ Decided (8/8), 25 Sep 2026 |
| **M07** | [Learning & development](M07-learning-and-development.md) | Courses, paths, sessions, SCORM, enrolment & waitlists, compliance rules, certifications & renewal, training needs, budgets & bonds, trainers, effectiveness | ✅ Decided (8/8), 25 Sep 2026 |
| **M08** | [Helpdesk, cases & policies](M08-helpdesk-cases-policies.md) | Helpdesk queues/SLA/KB, grievance, POSH (IC, 90-day inquiry, annual report), disciplinary, whistleblower, policy acknowledgement | ✅ Decided (8/8), 25 Sep 2026 |
| **M09** | [Engage](M09-engage.md) | Spaces & feed, moderation, polls, surveys, pulse & eNPS, kudos & rewards, celebrations, action plans, mirrors | ✅ Decided (8/8), 25 Sep 2026 |
| **M10** | [ATS: internal, staffing desk & client helpdesk](M10-ats.md) | Deltas on the exam-app ATS: headcount plan, P01 links, scorecards, AI first round, structured offers, offer→employee, BGV, retention, merge; staffing clients, submissions, placements, invoices, client portal | ✅ Decided (8/8), 25 Sep 2026 |
| **M11** | [Benefits administration & flexible benefit plan](M11-benefits-fbp.md) | Insurance (GMC / GPA / GTL) enrolment, dependants, endorsements, premiums & 80D, FBP basket / claims / year-end sweep, employer NPS, benefit catalogue | ✅ Decided (5/5), 26 Sep 2026 |
| **M12** | [Projects & timesheets](M12-projects-timesheets.md) | Projects, tasks, weekly timesheets, utilisation, project costing, client billing | ✅ Decided by principle, 26 Sep 2026 |
| **M13** | [Contract labour (CLRA)](M13-contract-labour-clra.md) | Contractors, contract workers, site attendance, CLRA registers and returns, wage-payment proof, principal-employer compliance | ✅ Decided by principle, 26 Sep 2026 |
| Review | [Consistency review](CONSISTENCY-REVIEW.md) | Cross-check of all 20 docs, ~85 fixes, decision R1 (AI interview data path), open team actions | ✅ Applied, 25 Sep 2026 |
| Market | [Market & competitor analysis](MARKET-COMPETITOR-ANALYSIS.md) | 58 products, 12 cross-market pains, pain → design mapping (19 covered / 10 partly / 1 missing), proposed additions G1–G17, marketing claims; raw evidence in `research/` | 26 Sep 2026 |
| Pricing | [Pricing & unit economics](PRICING-UNIT-ECONOMICS.md) | Cost per employee by stage, $1 strategy confirmed, minimums ₹499 / ₹999 / ₹999, bank-rail default + 2 % discount, gateway fee table, partner commission reference (rates deferred) | 27 Sep 2026 |
| Landscape | [Market pricing landscape](MARKET-PRICING-LANDSCAPE.md) | ~170 vendors (HRMS India/global, ATS, staffing, assessment, proctoring): price models, what each plan includes, 7 cost scenarios, segments to capture; workbook `research/YukthiX-Market-Pricing-Comparison.xlsx` | 27 Sep 2026 |
| Hosting | [Hosting run cost](HOSTING-RUN-COST.md) | Monthly server cost on AWS, DigitalOcean, E2E, Oracle India and Hetzner at 4 growth stages (2–11 % of revenue), 15 savings levers, suggestion for P13; model `research/hosting_model.py` | 27 Sep 2026 |
| Brand | [Brand guidelines](../brand/BRAND-GUIDELINES.md) · [Logo brief](../brand/LOGO-DESIGN-BRIEF.md) | v1.0: purpose, values, positioning, "Everything. Included.", personality, architecture (YukthiX HR / Hire / Assess / Analytics), name story, voice and writing rules, colour (Azure), type, imagery, applications, in-product branding, trademark, governance; 11 team actions | 27 Sep 2026 |
| Validation 3 | [Validation pass 3](VALIDATION-PASS-3.md) | 5 new lenses (laws 2025–27, 2026 HR tech, verticals + global, SaaS growth/ops, 7 end-to-end journeys): 98 gaps — 4 corrections + 16 Must, then Should / Later / Skip. **Proposals, awaiting founder decisions** | 28 Sep 2026 |
| **T01** | [Proctoring: question bank & content](T01-question-bank.md) | Types, skill taxonomy, versions, review workflow, multi-language, rich media, duplicates, AI drafts, library packs | ✅ Decided (8/8), 25 Sep 2026 |
| **T02** | [Proctoring: test builder, adaptive & psychometrics](T02-test-builder-adaptive.md) | Test versions, blueprint & pool depth, timing & navigation, retakes, coding / SQL sandbox, adaptive (staircase → IRT CAT), scaled scores, item & test statistics, exposure control | ✅ Decided (8/8), 25 Sep 2026 |
| **T03** | [Proctoring: delivery](T03-delivery.md) | Scheduling & slots, reminders, no-shows, drives at scale, low connectivity, time credit & re-auth, breaks, device policy, readiness check, accessibility & accommodations | ✅ Decided (8/8), 25 Sep 2026 |
| **T04** | [Proctoring: controls, AI-assistance detection & monitoring](T04-proctoring-monitoring.md) | Modes & action matrix, secure browser, ID check, room scan & companion phone, recording, audio, AI-assistance signals, proctors & shifts | ✅ Decided (8/8), 25 Sep 2026 |
| **T05** | [Proctoring: integrity, evaluation & outcomes](T05-integrity-evaluation-outcomes.md) | Incidents & evidence, verdicts, appeals, collusion / plagiarism / leaks, rubrics & multiple evaluators, result release, ATS / HRMS hand-offs, retention, consent & fairness | ✅ Decided (8/8), 25 Sep 2026 |
| **T06** | [Psychometric & behavioural assessments](T06-psychometric-assessments.md) | Cognitive, SJT, personality (forced-choice), motivation; norms, job profiles, reports, evidence & adverse-impact guardrails | ✅ Decided (6/6), 26 Sep 2026 |
| **T07** | [Project coding & live technical interview](T07-project-coding-live-interview.md) | Multi-file IDE projects, front-end preview, notebooks, DevOps, git take-home, code review tasks, live pair-programming room, code playback | ✅ Decided (6/6), 26 Sep 2026 |
| **T08** | [YukthiX Secure Client](T08-secure-client.md) | Own lock-down client on Windows / macOS / Linux / ChromeOS + browser extension: kiosk, process / VM / virtual-device / capture / mirroring / remote-control detection, LAN hints, signed auto-update; SEB kept | ✅ Decided (5/5), 26 Sep 2026 |
| Parked | Alumni portal (spec §1.3.14, wave 6) | Basic 7-year document access is decided (P05 Q6); the full portal (dues tracker, verification requests, rehire pool, alumni referrals, community) is parked until wave 6 | ⏸ Parked 25 Sep 2026 |
| Review | [Gap register](GAP-REGISTER.md) | Gold-standard review (spec coverage, non-functional, HRMS/ATS and proctoring benchmarks): first pass: 13 must-have, 20 should-have, proposed docs P12–P16, M11–M12, T06–T08; second pass: 13 design defects (D), 20 India lifecycle events (E), missing catalogues (F), admin editors (G), analytics & legal (H) | 📋 Proposed, 25 Sep 2026 |
| APX-A | [Notification catalogue](APX-A-notifications.md) | 367 notification types, 72 scheduler rules, WhatsApp / SMS template pack, channel opt-in | ✅ 26 Sep 2026 |
| APX-B | [Event catalogue](APX-B-events.md) | 343 domain events, producers / consumers / sensitivity / webhooks, CI checks | ✅ 26 Sep 2026 |
| APX-C | [Reports & metrics](APX-C-reports-metrics.md) | 130 standard reports, 96 new metrics, finance provisions, role dashboards | ✅ 26 Sep 2026 |
| APX-D | [Screens & navigation](APX-D-screens-navigation.md) | 249 screens, Settings map, T9 external shell, mobile tab map, help UX, U1–U103 closure | ✅ 26 Sep 2026 |
| APX-E | [Setup hub & admin editors](APX-E-setup-admin.md) | Setup hub, go-live readiness, 174 admin editors | ✅ 26 Sep 2026 |
| APX-F | [Template library](APX-F-templates.md) | 90 starter letter / form / invoice / payslip templates | ✅ 26 Sep 2026 |
| APX-G | [Legal & trust artefacts](APX-G-legal-artefacts.md) | 23 artefacts as lawyer briefs, acceptance tracking | ✅ 26 Sep 2026 |

## Template for every design doc

1. **Purpose & scope:** spec sections and decisions covered.
2. **What exists today:** in the exam app (file paths, `origin/main`), what we reuse or change.
3. **Concepts:** plain-language definitions.
4. **Data model:** tables, key columns, constraints (Postgres), tenancy.
5. **Rules:** numbered `YX-<AREA>-nn`, each testable.
6. **Flows / APIs:** main operations and events emitted.
7. **UI:** which templates and components (from the UI brief).
8. **Migration & rollout:** from the exam app's current state.
9. **Acceptance tests:** including the "do not repeat" Frappe defects and U-issues.
10. **Open questions:** each with a recommendation, answered one at a time and then recorded in §11.
11. **Decisions:** date-stamped.

## Rule ID areas

`ORG` tenancy & org · `SEC` access & privacy · `WF` workflow · `NTF` notifications · `DOC` documents · `HIS` history · `STAT` statutory data · `LOCK` locks & audit · `MET` metrics · `AI` / `INT` AI & integrations · `API` API-first · `IAM` identity · `SECOPS` security programme · `BILL` billing · `TEN` tenant lifecycle · `CONSOLE` platform console · `GRO` growth, trial & customer operations (P20) · `GLB` global readiness (P21) · `PTR` partners · `MIG` migration · `SRCH` global search · `CUST` custom objects · `RULE` policy rule builder · `WFS` workflow studio & AI assistant (P22) · `AST` employee & manager assistants, marketplaces (P23) · proctoring areas: `QB` question bank, `TB` test builder, `DLV` delivery, `PROC` proctoring, `EVAL` integrity & evaluation, `PSY` psychometrics, `CODE` project coding & live interview, `SCL` secure client · module areas: `EMP`, `LV`, `AT`, `PAY`, `TAX`, `LC`, `EXP`, `PERF`, `LRN`, `HD`, `ATS`, `MOB` (mobile), `BEN` (benefits), `CASE` (grievance / disciplinary / whistleblower), `POSH`, `POL` (policies), `ENG` (engage), `PRJ` (projects & timesheets), `CLRA` (contract labour).
