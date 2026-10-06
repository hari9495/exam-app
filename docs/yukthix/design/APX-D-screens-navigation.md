# Appendix D · Screen inventory, navigation, Settings map & U-issue closure

> **Status:** Catalogue, 26 Sep 2026. Closes GAP-REGISTER **F5** (screen inventory & navigation), **F6** (U-issue closure) and **H7** (help & onboarding UX); gives D17 its home ("every policy needs an editor"). **Extended 26 Sep 2026 (gap register, user decision):** screens for M12, M13, P17, P18 and the new B / C features (§1, §2, §5); **F-13** closed by the "Settings pages by owning doc" table (§3); **F-16** closed by the footer-owner table (§4). **P16 follow-up 26 Sep 2026:** partner portal (§2.20), client-side Partners screen and Settings 2.11, console screens YX-06…08. **P19 follow-up 26 Sep 2026:** policy rule builder screens PLT-31…37 and Settings 1.8. **Validation pass 3 Musts, 28 Sep 2026:** accident, identity-chain, person-record and trial / growth screens (PLT-39…43, PPL-34…37, PAY-28, CMP-12, HLP-12, HIR-22, T9-15…17, YX-09…14, CLB-05), Settings 7.9 and 8.6, amendments to PPL-01, HIR-05 and 2.10. **P22 follow-up 28 Sep 2026:** Workflow Studio and AI assistant screens PLT-55…64 (§2.22); settings on the existing 1.8 page (no new settings page). **P23 follow-up 28 Sep 2026:** assistant and marketplace screens PAY-40…43, HLP-14, TIM-43, PRJ-08, PRF-16 / 17, ENG-12 (§2.23); settings on existing pages 3.11, 4.5, 4.11, 5.7, 6.3, 7.5, 7.6 (no new settings page).
> **Extends:** the [UI design brief](../reference/frappe-hrms-functional-spec/99-ui-design-brief.md) §3 (templates, adds **T9**), §4 (navigation, adds **Engage** and the **Settings map**), §5–§6 (help patterns) and §8 (inventory, now counted here). [M04](M04-mobile-app.md) §3 points to §5 below as the **canonical mobile tab map**.
> **Sources read:** UI brief; UI references 01–10 and [11-analytics](../reference/frappe-hrms-functional-spec/11-analytics.md) (U1–U103); §7 UI of P01–P11, M01–M10, T01–T05 (M01 §6); every doc's §10/§11 for configurable policies; GAP-REGISTER F5, F6, G1–G5, H6, H7; spec D16, D17.
> **Clean-room:** layouts and flows only; no Frappe wording. U-numbers are cited as "do not repeat" inputs.

**Counts at a glance.** Screens (§2): **423** (249 + 41 added 26 Sep 2026 + 13 P16 follow-up + 7 P19 follow-up + 1 PLT-38 + 23 validation pass 3, 28 Sep 2026 + 44 validation pass 3 Shoulds + 25 Shoulds second catalogue pass (hiring, growth), §2.21 + 10 P22 Workflow Studio & AI assistant, §2.22 + 10 P23 assistants and marketplaces, §2.23). Settings pages (§3): **71** in **8** groups (7.9 Deepfake detection and 8.6 Analytics, status & tips added 28 Sep 2026; 62 + 5 added 26 Sep 2026 + 2.11 Partners, P16 follow-up + 1.8 Policies & rules, P19 follow-up). U-issues (§7): **70** fixed by rule · **31** fixed by UI pattern · **2** won't do (103). Follow-ups for owning docs (§8): **16**.

**Legends used below**

| Code | Meaning |
|---|---|
| **T1–T9** | Page templates (brief §3; T9 is new, §4 here). "T3 tab / drawer" = a tab or drawer inside a T3 workspace. |
| **Wave** | Spec §4 build wave 1–7. **PT** = Proctoring track (T01 §8: not bound to HRMS waves; exam app). **1→** = starts in wave 1 and grows every wave. **prop.** = proposed in GAP-REGISTER, not yet decided. |
| **Where** | **D** desktop (T1 shell) · **M** mobile app (T8) · **D+M** both · **W** web portal (T9, mobile-friendly) · **K** shared kiosk · **C** chat app card (Slack / Microsoft Teams, B9) |
| Personas | Emp employee · Mgr manager · HR · PA payroll admin · Fin finance · SA system admin · Aud auditor · Exec leadership · Rec recruiter · HM hiring manager · Int interviewer · AM staffing account manager · L&D · Trn external trainer · Agt helpdesk agent · QL queue lead · IC internal committee · EO ethics officer · ACC audit-committee chair · Mod moderator · TO test owner / author · Rev reviewer · Pr proctor · Ev evaluator · Cand candidate · Cli client contact · Alm alumni · Nom nominee / legal heir · Pub public · Dev developer · YX YukthiX staff · Ptr partner user (CA firm / payroll bureau / reseller / implementation partner) |

---

## 1. Desktop navigation

The T1 sidebar is **role-based** (a person sees only modules and items their P02 grants reach) and holds **at most 8 items per module** (brief principle 7; fixes U10). Module settings are **not** sidebar items: each module shows a gear shortcut that deep-links to its page in the Settings map (§3).

### 1.1 Global (outside the modules)

| Item | Contents | Doc |
|---|---|---|
| **Home** | Role home: employee (my day, balances, requests, payslip, tasks), manager (waiting for me, team today, goals / reviews), HR (exceptions, run status, due dates, cases, cycles), finance (to pay, payroll approval, statutory payments) | Brief §4.2, P09 |
| **Approvals** | Waiting for me · Delegated to me · Sent by me · Team history; bulk approve for low-risk types | P03 §7 |
| **Notifications** | Bell panel + full inbox, grouped and actionable | P04 §7 |
| **Search** | Search box + **command palette (Ctrl-K / Cmd-K)**: records (people, candidates, jobs, requests, documents, policies, tickets, cases for members, reports, settings, custom objects), actions ("apply leave", "approve"), recent items; filtered by P02 at query time | P17 |
| **Me** (avatar menu) | Profile · Documents & letters · My pay · My time & leave · Goals, feedback & learning · Help & cases · Privacy (My data, Who accessed my data) · Preferences (language, notifications, delegation, devices) | P02, P03, P04, P08 |
| **Settings** | 8 groups with search (§3) | P01 §4.6 |
| **Help** | Contextual help drawer, tours, "what's new" (§6) | This appendix |

### 1.2 Modules → menu items

| Module | Menu items (≤ 8) | Notes |
|---|---|---|
| **People** | Directory · Org chart · Onboarding (board, ready to onboard, batches, probation) · Changes (change action, scheduled, bulk, restructure) · Exits (cases, F&F, clearance) · Documents & letters · Assets · Succession | Lifecycle lives only here (fixes U53, U76) |
| **Time** | **Today** (board; **Field** tab: live map & visits, B2) · Muster · Roster (**auto-roster, open shifts, bids**, B3) · Leave calendar · Requests (exceptions, OT review, timesheets, presence days C1) · Year-end · Periods · Reports | Desk **Time › Today** board added (F5); field force, auto-roster and presence as tabs (26 Sep 2026) |
| **Pay** | Payroll (home, runs, queries) · Compensation · One-time pay & holds · Tax centre (HR view, proof verification) · Loans, recoveries & **EWA** (B10) · Expenses & advances (claims, trips, to pay) · Payments & files · Reports | Expenses per brief §4.1 |
| **Compliance** | Statutory hub · Statutory set-up · Registers · TDS & Form 16 · Missing IDs · Rules & updates · POSH (restricted) | POSH only for IC members (YX-POSH-05) |
| **Performance** | Goals · Reviews & cycles · Feedback · **1:1s** · Calibration & comp review · PIPs · Learning (my learning, catalogue, sessions, compliance, needs & budgets) · Skills | 1:1s added (F5); Learning keeps the brief's placement |
| **Helpdesk** | Help centre · Tickets (agent desk) · Knowledge base · Cases (restricted) · Speak-up (ethics desk) · Policies · SLAs | Cases visible to case members only (YX-CASE-02) |
| **Engage** (new) | **Feed · Announcements · Surveys · Recognition · Moderation** | M09; spaces, polls and action plans are tabs inside Feed / Surveys; rewards inside Recognition |
| **Hiring** (exam-app ATS) | Headcount plan · Jobs & requisitions (**job-board postings**, B8) · Pipeline · Interviews · Offers & BGV · Candidates & **talent CRM** (pools, campaigns, B8) · Careers site · **Staffing desk** (clients, rate cards, submissions, placements, bench, invoices, collections, **vendors**, C7) | Staffing desk added under Hiring (F5) |
| **Proctoring** (exam app) | Question bank · Tests · Drives & schedule (invitations, slot calendar, **drive capacity planner**, **accommodation queue**, **campus kit & institutions** B7, **test centres** C5) · Live (**live console**, **proctor planner**, **connectivity panel**) · Integrity (review queue, **incident workspace**, appeals) · Evaluation (**evaluator console**) · Results & reports · Company audit view | Candidate side (**candidate portal**, **readiness**, **privacy centre**) is a T9 portal (§4) |
| **Analytics** | Dashboards · Explorer · Reports · Schedules · Ask (AI) · Metric catalogue | 11-analytics §6.2, P09 |
| **Projects** (new, M12) | Projects · Timesheet approvals · Capacity & utilisation · Costing & margin · Billing workbench · Reports | M12 §7; timesheet entry stays in Time (TIM-15) |
| **Contract labour** (new, M13) | Contractors · Contract workers · Vendor compliance · CLRA registers & returns · Reports | M13; statute `IN.CLRA` (P07 B17); POSH / cases unchanged |
| **Visitors** (new, M02 §B11) | Today's visitors · Invites · Visitor log · Kiosks & badges · Reports | Location operations; hosts pre-register from Me (§5) |
| **Custom** (new, P18) | One item per company-defined object not placed under another module; builders live in Settings 1.7 | Objects placed under a module count against its ≤ 8 items ("More" beyond) |

---

## 2. Screen inventory

The brief's §8 target was "about 90 screens before de-duplication" across 11 module rows. Reconciled with every screen named in the design docs' §7 (M01 §6), the gap register (D, E, F, G) and the proctoring and staffing additions, the inventory was **249 screens**; the 26 Sep 2026 gap-register extension adds **41** (M12, M13, P17, P18 and B / C features) for **290**; the P16 follow-up (26 Sep 2026) adds **13** (partner portal PTR 9, PLT-30, YX-06…08) for **303**; the P19 follow-up (26 Sep 2026) adds **7** (PLT-31…37) for **310**; the market-analysis additions (26 Sep 2026, G6) add **1** (PLT-38 Jobs & errors) for **311**; validation pass 3 (28 Sep 2026) adds **23** (PLT-39…43, PPL-34…37, PAY-28, CMP-12, HLP-12, HIR-22, T9-15…17, YX-09…14, CLB-05) for **334**; validation pass 3 Shoulds (28 Sep 2026, §2.21) add **44** for **378**; the second Should catalogue pass (hiring and growth, §2.21) adds **25** (HIR-24…31, T9-18…25, PRJ-06 / 07, PLT-50…54, YX-17 / 18) for **403**; P22 (28 Sep 2026, §2.22) adds **10** (PLT-55…64) for **413**; P23 (28 Sep 2026, §2.23) adds **10** (PAY-40…43, HLP-14, TIM-43, PRJ-08, PRF-16 / 17, ENG-12) for **423**. Shared screens (approvals inbox, request sheet, record workspace, checklists, letters) are listed **once**, under Platform. Simple setting forms are counted only in the Settings map (§3); settings editors with a bespoke layout (leave types, shift editor, template builder…) appear here too.

| Brief §8 row | Brief target | This inventory |
|---|---|---|
| Core HR / People (00, 05) + documents | 10 | 46 (PPL) |
| Leave + Attendance (01, 02) | 13 + 12 | 42 (TIM) |
| Payroll (03) | 10 | 39 (PAY) |
| Expenses (06) | 8 | 9 (EXP) |
| Statutory (04) + POSH | 7 | 12 (CMP) |
| Performance (07) + Learning (09) | 9 + part of 8 | 31 (PRF 15, LRN 16) |
| Cases & misc (09) | part of 8 | 13 (HLP) |
| **Engage** | — (missing) | 11 (ENG) |
| Hiring (08) + **staffing desk** | +6 | 31 (HIR) |
| **Proctoring** | "Existing" | 32 (PRC) |
| Analytics (11) | 8 | 9 (ANL) |
| Platform, external portals, YukthiX console, mobile shell | — | 100 (PLT 54, T9 25, YX 18, MOB 3; was 35) |
| **Projects** (M12), **Contract labour** (M13), **Visitors** (M02 §B11) — added 26 Sep 2026 | — | 19 (PRJ 7, CLB 8, VIS 4) |
| **Partner portal** (P16) — P16 follow-up 26 Sep 2026 | — | 9 (PTR) |
| **Total** | ~90 | **403** (249 + 41 + 13 + 7 + 1 added 26 Sep 2026 + 23 + 44 + 25 added 28 Sep 2026) |

### 2.1 Platform & shared (PLT)

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PLT-01 | App shell: role sidebar, entity + period switcher, bell, global search box (Ctrl-K) | T1 | P01 §8, P17 | all desk | 1 | D |
| PLT-02 | Role homes (employee / manager / HR / finance) | T6 | Brief §4.2, P09 | Emp, Mgr, HR, Fin | 1→ | D |
| PLT-03 | Notifications inbox | T2 | P04 §7 | all | 1 | D+M |
| PLT-04 | Approvals inbox (tabs, filters, bulk, inline cards) | T2 | P03 §7 | approvers | 1 | D+M |
| PLT-05 | Request sheet (type picker → type form with live summary; "on behalf of" for proxies) | T4 | P03 §4, M04 §6, YX-WF-18 | Emp, Mgr, HR | 1 | D+M |
| PLT-06 | My requests (status, latest step, raised on my behalf) | T2 | P03, M04 D5 | Emp | 1 | D+M |
| PLT-07 | Delegation ("I'm away from… to…, delegate to…") | T4 | P03 §7 | Mgr | 1 | D+M |
| PLT-08 | Set-up hub / go-live readiness (completeness card per module) | T6 | P01 §7, GAP G1 (F-12) | SA, HR | 1 | D |
| PLT-09 | Tenant set-up wizard | T5 | P01 §7 | SA | 1 | D |
| PLT-10 | Settings home (8 groups, settings search) | T1 | §3, P01 §4.6 | SA, admins | 1 | D |
| PLT-11 | Roles & access (role list, role workspace, field-class matrix, risk check, effective-access preview, who has this role; user access tab with grants, scopes and dates) | T3 | P02 §7 | SA | 1 | D |
| PLT-12 | Approval policy editor (priority, conditions, step cards, Simulate) | T3 | P03 §7 | HR, SA | 1 | D |
| PLT-13 | Notification settings, template editor (variables, preview, test send), delivery log, usage | T3 | P04 §7 | SA, HR | 1 | D |
| PLT-14 | Integrations: catalogue, connect wizards, health cards, run logs, mappings | T2 / T5 | P10 §7 | SA | 1→ | D |
| PLT-15 | Developers: API keys, OAuth apps, webhooks (delivery log, replay, test event), usage | T2 | P11 §7 | SA, Dev | 1 | D |
| PLT-16 | Audit log (filters, diff viewer, chain status) | T2 | P08 §7 | SA, Aud | 1 | D |
| PLT-17 | Support-access requests (approve window, scope, activity) | T2 | P02 Q8 | SA | 1 | D |
| PLT-18 | Access denied (with Request access) / not found | T1 state | §6.3 | all | 1 | D+M |
| PLT-19 | Billing, usage & sandbox (plan, add-ons, caps, invoices; clone / dry-run / promote) | T6 / T5 | GAP A4, A5 (P14, P15) | SA | prop. | D |
| PLT-20 | **Command palette** (Ctrl-K / Cmd-K overlay: grouped records, actions, recent items, prefixes `@ # > ?`) | T1 overlay | P17 §4 | all desk | 2 | D (+M search) |
| PLT-21 | Search results page (source / entity / date filters, saved searches) | T2 | P17 §7 | all | 2 | D+M |
| PLT-22 | **Custom object builder** (fields, class, validation, relationships, scope model, starters) | T3 | P18 §4.1 | SA, HR | 6 | D |
| PLT-23 | **Form & page-layout builder** (drag-and-drop sections, conditional rules, preview as role, desk / mobile) | T3 canvas | P18 §4.3 | SA, HR | 6 | D |
| PLT-24 | Custom request-type builder (layout → policy → effect) | T5 | P18 §4.4 | SA, HR | 6 | D |
| PLT-25 | Customisation packages & promotion (versions, diff, approve) | T2 | P18 §4.6 | SA | 6 | D |
| PLT-26 | Custom object list + record (generated from metadata; import / export) | T2 / T3 | P18 §7 | per object scope | 6 | D+M |
| PLT-27 | **DSAR tracker** (requests from data principals, SLA clock, data-pull checklist per module, response pack, erasure log) | T2 / T3 | P02 §6 (B12) | DPO, HR, SA | 3 | D |
| PLT-28 | **AI quality & governance** (tenant view: AI features on, model / prompt versions, eval scores, overrides, feedback) | T6 | P10 (B13), P09 YX-MET-17 | SA | 5 | D |
| PLT-29 | **Slack / Teams app** (connect, app home, approve / reject cards, check-in, balances, notifications) | chat card | P04 §4.9 (B9) | Emp, Mgr | per P04 B9 | C |
| PLT-30 | **Partners** (client side: linked partners with ownership and named client contact, grant editor, approval-delegation switches, access log, end link, ownership transfer; partner directory with link request) | T3 | P16 §7, YX-PTR-02 / 05 / 13 / 14 | SA, HR, named client contact | 3 | D |
| PLT-31 | **Policies** page per module (one shared pattern: policy points with the active rule, scope chips, "starter" / "customised" badge, last change; opened from each module's gear) | T2 | P19 §7, YX-RULE-01 | module policy owners, HR, PA, SA | 1→ | D |
| PLT-32 | **Rule builder** (builder tab: condition groups, field picker over built-in / custom / related fields; formula tab; scope, priority, effective date; plain-language summary; overlap and unreachable warnings; version diff; submit for approval) | T3 | P19 §7, Q1, YX-RULE-02 / 09 | module policy owners, SA | 1 | D |
| PLT-33 | Impact preview (live read-only or sandbox: affected count, old vs new per person, money impact, validation failures, automation runs; test on one employee; download per P02) | T3 drawer | P19 §3, YX-RULE-07 | rule authors, approvers | 1 | D |
| PLT-34 | Lookup tables (effective-dated rows, Excel import, "used by" rules) | T2 / T3 | P19 §3 | module policy owners, SA | 1 | D |
| PLT-35 | **Automations** (list; trigger → conditions → actions with 30-day dry run; run log; failure queue with retry / skip; usage vs limit) | T2 / T3 | P19 §6 flow 4, YX-RULE-11 | SA, automation owners | 2 | D |
| PLT-36 | Validation rules per record type (condition, message, block / warn; existing invalid records listed) | T2 / T3 | P19 §6 flow 3 | SA, HR | 1 | D |
| PLT-37 | **"Why" panel** (employee-facing: result, rule name, company policy or legal adjustment; no other people's data) | T1 drawer | P19 YX-RULE-10 | Emp, Mgr | 1→ | D+M |
| PLT-38 | **Jobs & errors** (one admin page for import errors, integration deliveries, notification failures, scheduled-job failures and automation failures; one row shape: kind · source · record · plain error · attempts · next retry · owner; filters by kind / source / age; **Retry**, **Skip with reason**, open record; failures without an owner escalate to the System Admin) | T2 | Market analysis §4 G6; P10 YX-INT-10; P04 §7, P15, P19 PLT-35 | SA, HR, PA | 1 | D |
| PLT-39 | **Quick-start lane** panel in the set-up hub (per product: at most three steps to first value with starter templates, progress, skip / resume) | T3 panel | P20 YX-GRO-01, APX-E | SA, HR, PA, Rec | before public launch | D |
| PLT-40 | **"Switch on"** card (product not yet on, trial limit reached or first value reached: what it adds, price, switch on / talk to us / not now) | T1 card | P20 YX-GRO-04, P14 YX-BILL-12 | SA | before public launch | D |
| PLT-41 | **"Talk to us"** dialog (above the size threshold: pick a time, callback, topics; shown once per trigger) | T4 dialog | P20 YX-GRO-05 | SA | before public launch | D |
| PLT-42 | Trial extension dialog (automatic 14-day extension notice, or self-serve request with reason; one extension) | T4 dialog | P20 YX-GRO-06, P14 YX-TEN-08 | SA | before public launch | D |
| PLT-43 | Trial read-only banner (30-day read-only after trial end: what still works — view, full export — and switch on) | T1 state | P14 YX-TEN-08 | all desk | before public launch | D+M |

### 2.2 People (PPL) — M01, P05, P06, P02, P08

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PPL-01 | Employee directory (workforce filter: employees · contract workers · consultants · placements · all persons; total-workforce headcount card, P01 YX-ORG-26) | T2 | M01 §3.2, P02 Q4 | all | 1 | D+M |
| PPL-02 | Org chart (search, expand, export, as-on date) | T6 | M01 §3.2 | all | 1 | D |
| PPL-03 | Employee workspace (Overview · Job · Personal · Identity & bank · Family & nominees · Emergency · Documents · Compensation · Leave & attendance · Performance · Assets · Activity; Timeline tab with as-of picker) | T3 | M01 §3.1, P06 §7, P05 §7 | HR, Mgr | 1 | D |
| PPL-04 | Change action (type → effective date → values → impact preview → approval) | T4 | P06 §7, M01 §3.3 | HR, Mgr | 1 | D |
| PPL-05 | Scheduled changes (next 30/60/90 days, edit / cancel) | T2 | P06 §7 | HR | 1 | D |
| PPL-06 | Bulk changes wizard (annual increment, reorg) | T5 | P06 §7 | HR | 1 | D |
| PPL-07 | Employee import (validation preview) | T5 | P01 §7 | HR | 1 | D |
| PPL-08 | Team page (members, today, upcoming, pending, tasks) | T6 | M01 §3.10 | Mgr | 1 | D |
| PPL-09 | Bulk transfer / restructure wizard (entity merge / close) | T5 | M01 §3.3 (E8), YX-ORG-22 | HR | 4 | D |
| PPL-10 | Inter-entity continuity checklist (on the change) | T3 panel | M01 §3.3 (E9) | HR, PA | 4 | D |
| PPL-11 | Onboarding board (Offer accepted → Pre-boarding → Day 1 → First 30 days → Done) | T6 | M01 §6 | HR | 4 | D |
| PPL-12 | Ready to onboard queue (manual hand-off, Create employee) | T2 | M01 §3.5, M10 Q2 | HR | 4 | D |
| PPL-13 | Journey record (checklist with owners, relative due dates, progress ring) | T3 | M01 §3.5 | HR, IT, Mgr, Emp | 4 | D |
| PPL-14 | Pre-boarding batches (campus, batch joining date) | T2 | M01 §3.5 (E18) | HR | 4 | D |
| PPL-15 | Pre-boarding actions: postpone / did not join / reneged / withdraw; rehire impact preview | T4 | M01 §3.5 (D3, E5) | HR | 4 | D |
| PPL-16 | Probation reviews queue | T2 | M01 §3.4 | HR | 4 | D |
| PPL-17 | Probation review form (confirm / extend / terminate) | T4 | M01 §3.4 | Mgr | 4 | D+M |
| PPL-18 | Resignation sheet (+ withdraw) | T4 | M01 §3.7 | Emp | 4 | D+M |
| PPL-19 | Exit cases (list + stepper: approval & notice → clearance → exit interview → F&F → documents; deprovisioning and open-case panels) | T2 / T5 | M01 §6, §3.7 | HR, Mgr | 4 | D |
| PPL-20 | Clearance sign-offs (per department owner) | T2 | M01 §3.7 | IT, Admin, Fin, Mgr | 4 | D+M |
| PPL-21 | Exit interview | T4 | M01 §3.7 | Emp, HR | 4 | D+M |
| PPL-22 | F&F calculator (explained lines, deadline countdown) | T5 | M01 §3.8 | HR, PA, Fin | 4 | D |
| PPL-23 | Death-in-service flow (payees, forms checklist, letters) | T5 | M01 §3.7 (E1) | HR | 4 | D |
| PPL-24 | Absconding timeline (steps, dispatch refs, stop / resume) | T3 | M01 §3.7 (E4) | HR | 4 | D |
| PPL-25 | Asset register + issue / return dialog (employee acknowledgement) | T2 / T4 | M01 §3.6 | Admin, HR, Emp | 4 | D+M |
| PPL-26 | Succession (critical positions, readiness, "no ready successor" risk) | T6 | M01 §3.9 | HR, Exec | 4 | D |
| PPL-27 | Document verification queue | T2 | P05 Q7, P10 Q6 | HR | 1 | D |
| PPL-28 | Issue letter + bulk issue + issued letters register | T4 / T5 | P05 §7 | HR | 1 | D |
| PPL-29 | Letter templates (Word upload with validation, in-app editor, cheat-sheet, test render) | T3 | P05 §7 | HR | 1 | D |
| PPL-30 | My documents & letters (camera upload, status, download, share link, certificates) | T2 | P05 §7 | Emp | 1 | D+M |
| PPL-31 | Self-service certificate request (instant) | T4 | P05 Q8 | Emp | 1 | D+M |
| PPL-32 | Profile change request (identity, bank, legal name) | T4 | M01 §3.1, P02 §4.5 | Emp | 1 | D+M |
| PPL-33 | My data + Who accessed my data | T3 | P02 §7, P08 Q6 | Emp | 1 | D+M |
| PPL-34 | **Identity panel** on the person record (consent status per jurisdiction, capture point and date, checks run and results across hiring, re-verify request; no face image shown) | T3 panel | P01 `persons`, T04 YX-PROC-19 | HR, Rec (per grant) | PT / 7 | D |
| PPL-35 | **Person timeline / roles panel** (every role of one person in the tenant: candidate, test-taker, employee, alumnus, contract worker, consultant, nominee; dates and links) | T3 panel | P01 YX-ORG-26 | HR | 1 | D |
| PPL-36 | "Possible same person" match queue (proposals from conflicting keys, name + DOB similarity or consented face match; evidence side by side; confirm / reject) | T2 | P01 YX-ORG-27 | HR | 1 | D |
| PPL-37 | Merge / unmerge review (records to combine, field-by-field choice, role links moved, audit note; unmerge restores the split) | T4 | P01 YX-ORG-27 | HR, SA | 1 | D |

### 2.3 Time (TIM) — M02, P08, M04

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| TIM-01 | **Time › Today** board (in / late / on leave / WFH / not checked in, exceptions, nudge) | T6 | M02, UI ref 02 #1, M04 Q5 | Mgr, HR | 2 | D (+M Team today) |
| TIM-02 | Muster grid (markers, row totals, mode shown) + freeze / lock | T6 | M02 §B5 | HR | 2 | D |
| TIM-03 | Day card (shift bar, punches with map and distance, late / OT, Fix) | T3 panel | M02 §B1–§B3 | Emp, Mgr, HR | 2 | D+M |
| TIM-04 | Attendance exceptions queue (nudges) | T2 | P08 Q4, M02 §B3 | HR, Mgr | 2 | D+M |
| TIM-05 | Roster (drag, copy week, swap, conflicts, publish) | T6 | M02 §B2 | Mgr, HR | 2 | D |
| TIM-06 | Shift editor with preview + shift patterns (weekly / N-day cycles) | T3 | M02 §B2 | HR | 2 | D |
| TIM-07 | Attendance request sheet (regularise / WFH / on-duty / OT pre-approval; effect preview) | T4 | M02 §B4 | Emp | 2 | D+M |
| TIM-08 | Shift change / swap request + colleague consent card | T4 | M02 §B2, §B4 | Emp | 2 | D+M |
| TIM-09 | OT review (after the fact, statutory-cap flags, comp-off option) | T2 | M02 Q7 | Mgr, HR | 2 | D |
| TIM-10 | Device backfill correction (late biometric batch) | T5 | M02 (E19), YX-LOCK-09 | HR | 2 | D |
| TIM-11 | Periods (month cards, lock stages, pre-lock checklist, reopen request) | T6 | P08 §7 | PA, HR | 2 | D |
| TIM-12 | Mobile check-in sheet (shift, time to start, geofence verdict, block reason) | T8 | M04 YX-MOB-05 | Emp | 2 | M |
| TIM-13 | Kiosk (code + PIN / QR → check-in, training attendance, apply leave, request status) | T8 kiosk | M04 Q4, D5 | Emp without phone | 2 | K |
| TIM-14 | Devices: kiosk registry & heartbeat, device-bind requests, remote sign-out | T2 | M04 Q3/Q4, YX-MOB-09 (G5) | HR, SA | 2 | D |
| TIM-15 | Timesheets (desk weekly grid; mobile day list, submit week) | T6 / T8 | M02 §B7 (D4) | Emp, project manager | 2 (placements 7) | D+M |
| TIM-16 | Attendance reports (muster roll, late / early, OT, Form 25, registers) | T7 | M02 §B5 | HR | 2 | D |
| TIM-17 | Leave home (role-based) | T6 | UI ref 01 #1 | Emp, Mgr, HR | 2 | D+M |
| TIM-18 | Apply leave (range picker with halves, live effect summary, delegate while away, notice-period warning) | T4 | M02 §A2 | Emp | 2 | D+M |
| TIM-19 | Leave request detail + withdraw / cancel | T3 | M02 §A2 | Emp, Mgr | 2 | D+M |
| TIM-20 | Team leave calendar | T6 | M02, UI ref 01 #5 | Mgr, HR | 2 | D+M |
| TIM-21 | Leave card (balances, ledger timeline, projection; HR adjust with reason) | T3 | M02 §A2 | Emp, HR | 2 | D+M |
| TIM-22 | Comp-off claim | T4 | M02 §A2 | Emp | 2 | D+M |
| TIM-23 | Optional holidays (choose N of M) | T4 | M02 §A2 | Emp | 2 | D+M |
| TIM-24 | Encashment request | T4 | M02 L5 | Emp | 2 | D+M |
| TIM-25 | Long-absence status card (maternity / sabbatical / long LWP, expected return) | T3 panel | M01 §3.3 (E3), M02 §A2 | Emp, HR | 4 | D+M |
| TIM-26 | Holiday calendars (per location, state templates, clone to next year) | T6 | M02 §A2 | HR | 2 | D |
| TIM-27 | Leave type editor (sectioned, live example) | T3 | M02 §A2 | HR | 2 | D |
| TIM-28 | Leave policies & assignment rules | T2 | M02 §A2 | HR | 2 | D |
| TIM-29 | Year-end wizard + leave-year change transition wizard | T5 | M02 §A2 (E19) | HR | 2 | D |
| TIM-30 | Leave reports (balances matrix, ledger, taken, LOP feed, liability, negative balances) | T7 | M02, GAP F4 | HR, Fin | 2 | D |
| TIM-31 | Locations & geofence map editor (radius, multiple points, IP ranges) | T3 | P01 §8, GAP G2 | HR, SA | 1 | D |
| TIM-32 | **Field-force** live map & visit log (duty-hours trail, client-site visits, beat coverage, distance) | T6 | M02 §B8 (B2) | Mgr, HR | 5 | D |
| TIM-33 | Visit check-in, beat plan & distance conveyance (tracking banner, consent) | T8 | M02 §B8 (B2), M04 | Emp (field) | 5 | M |
| TIM-34 | **Auto-roster**: demand editor, generated draft with coverage view and explanations, publish | T6 | M02 §B9 (B3) | Mgr, HR | 6 | D |
| TIM-35 | Open shifts & shift bidding (claim, rank preferences, awards) | T2 / T8 | M02 §B9 (B3) | Emp, Mgr | 6 | D+M |
| TIM-36 | Presence-based attendance (desktop agent / Teams presence day view, consent status) | T3 panel | M02 §B10 (C1) | Emp, Mgr, HR | 6 | D |

### 2.4 Pay (PAY) — M03

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PAY-01 | Payroll home (run stepper, blockers, due-date strip, last totals) | T6 | M03 §7 | PA | 3 | D |
| PAY-02 | Run readiness / pre-flight (attendance mode per group, inputs, validations, waive with reason) | T5 step | M03 §6, YX-PAY-05 | PA | 3 | D |
| PAY-03 | Run workspace (Inputs · Payslips · Variance · Validations · Approvals · Files; per-employee progress; payslip "why this number" drawer) | T3 / T5 | M03 §7 | PA, Fin | 3 | D |
| PAY-04 | Manual LOP / payable-days input (+ bulk upload) | T2 | M03 §6 (D1) | HR, PA | 3 | D |
| PAY-05 | One-time pay (list, bulk upload, recurring) | T2 | M03 §3 | PA | 3 | D |
| PAY-06 | Salary holds & releases (reason codes, hold ageing) | T2 | M03 YX-PAY-28 | PA | 3 | D |
| PAY-07 | Approve run / lock period | T4 irreversible | M03 §6, YX-PAY-07 | Fin, HR head | 3 | D |
| PAY-08 | Release bank file | T4 irreversible | M03 §6, YX-INT-03 | Fin | 3 | D |
| PAY-09 | Publish payslips | T4 irreversible | M03 §6 | PA | 3 | D |
| PAY-10 | Payments & files: payment status and failures, disbursement register (cash / cheque), journal export | T2 | M03 §6 (D11), YX-PAY-31, P10 Q7 | PA, Fin | 3 | D |
| PAY-11 | Off-cycle run (F&F, bonus, arrears only, correction) | T5 | M03 §6 | PA | 3 | D |
| PAY-12 | Compensation tab + revision sheet (timeline, arrears preview, pay basis) | T3 tab / T4 | M03 §4, §6 | PA, HR | 3 | D |
| PAY-13 | Template builder / CTC designer (formula editor, live test employee) | T3 | M03 §7 | PA | 3 | D |
| PAY-14 | Component library | T2 | M03 §3 (G4) | PA | 3 | D |
| PAY-15 | Payslip layout editor (sample-employee preview) | T3 | §8 F-6 (U33, G4) | PA | 3 | D |
| PAY-16 | Payroll set-up wizard (per entity) | T5 | M03 §6 | PA | 3 | D |
| PAY-17 | Loans & advances (schedule, pre-closure, EMI pause) | T2 / T3 | M03 Q4 | PA | 3 | D |
| PAY-18 | Loan / salary-advance request | T4 | M03 Q4 | Emp | 3 | D+M |
| PAY-19 | Court orders, carry-forwards & overpayment recoveries | T2 / T3 | M03 YX-PAY-29/30/32 | PA | 3 | D |
| PAY-20 | Payslip query queue | T2 | M03 §7 (D13) | PA | 3 | D |
| PAY-21 | Payslip viewer (net first, days strip, why-this-number, raise a query) | T3 / T8 | M03 §7 | Emp | 3 | D+M |
| PAY-22 | Tax workspace (regime compare, declarations, proofs, TDS explanation, 12B, residential status) | T3 | M03 §7 | Emp | 3 | D+M |
| PAY-23 | Proof verification queue (line by line) | T2 | M03 YX-TAX-05 (G4) | PA | 3 | D |
| PAY-24 | Bonus computation (annual) | T5 | M03 Q8 | PA | 3 | D |
| PAY-25 | Payroll reports (salary register, reconciliation, arrears, YTD, CTC, variance, bank advice, hold ageing, gratuity provision, loan ledger) | T7 | M03, GAP F4 | PA, Fin | 3 | D |
| PAY-26 | **Earned wage access** request (available amount, partner fee, partner terms, recovery preview) | T4 / T8 | M03 §6 item 10 (B10) | Emp | 5 | D+M |
| PAY-27 | EWA admin (policy, partner connection, draws, recoveries in payroll, reconciliation) | T2 | M03 (B10) | PA, Fin | 5 | D |
| PAY-28 | Arrears worksheet: **base confirmation** step (months before go-live use imported as-paid lines, labelled "based on imported figures"; PA confirms the base before compute) | T5 step | M03 YX-PAY-52, P15 YX-MIG-15 | PA | 3 | D |

### 2.5 Expenses (EXP) — M05

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| EXP-01 | Expenses home (my claims, waiting for me, to pay) | T6 | UI ref 06 #1 | Emp, Mgr, Fin | 5 | D+M |
| EXP-02 | Claim composer (receipt per card, OCR, policy flags, "you will receive ₹X") | T4 / T8 | M05 §7 | Emp | 5 | D+M |
| EXP-03 | Claim review (lines beside receipt viewer, reduce with reason) | T3 | M05 §7 | Mgr, Fin | 5 | D |
| EXP-04 | Trip (request sheet + record: itinerary, advance, bookings, claims, settlement) | T4 / T3 | M05 §3, §7 | Emp, Mgr, travel desk | 5 | D+M |
| EXP-05 | Advance card (balance ledger) + advance request | T3 / T4 | M05, UI ref 06 #5 | Emp, Fin | 5 | D+M |
| EXP-06 | Finance "to pay" queue (bulk payout / add to payroll) | T2 | M05 §7 | Fin | 5 | D |
| EXP-07 | Expense policy matrix (category × grade × tier) | T6 | M05 §7 | Fin, HR | 5 | D |
| EXP-08 | Corporate-card statement import & matching | T5 | M05 Q8 | Fin, Emp | 6 | D+M |
| EXP-09 | Expense reports (summary, advance ageing, unpaid, over-limit, GST input) | T7 | M05, GAP F4 | Fin | 5 | D |

### 2.6 Compliance (CMP) — M03 statutory, P07, M08 POSH

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| CMP-01 | Statutory hub (card per statute per month, due-date calendar) | T6 | M03 §7, P07 | PA | 3 | D |
| CMP-02 | Statutory set-up per entity (registrations, legal options, filing mode, deductor details, completeness) | T3 | M03 §4, P07 Q1, UI ref 04 #1 | PA | 3 | D |
| CMP-03 | Statutory registers (EPF, ESIC, PT, LWF; covered / not covered / not due) | T7 | M03 YX-PAY-20 | PA | 3 | D |
| CMP-04 | TDS challan sheet (pre-filled from runs, interest / late fee) | T4 | §8 F-7 (U45) | PA | 3 | D |
| CMP-05 | TDS return wizard (24Q / 138: prior-month rows, reconciliation, FVU or partner, corrections) | T5 | M03 §6 | PA | 3 | D |
| CMP-06 | Form 16 bulk (Part A import, Part B, DSC, publish) | T5 | M03 §6 | PA | 3 | D |
| CMP-07 | Missing-ID dashboard | T6 | UI ref 04 #2, YX-PAY-05 | HR, PA | 3 | D |
| CMP-08 | Statutory rules browser (read-only, history, sources) + updates banner | T2 | P07 §7 | PA | 3 | D |
| CMP-09 | IC console (committee, validity, cases, annual report builder, awareness log) | T3 | M08 §7, YX-POSH-06 | IC, HR | 4 | D |
| CMP-10 | POSH complaint filing | T4 | M08 | Emp | 4 | D+M |
| CMP-11 | POSH case workspace (statutory clock, members, Confidential watermark) | T3 | M08 §7 | IC | 4 | D |
| CMP-12 | **Supplementary filing** cards in the statutory hub (per origin month: supplementary / arrear ECR, ESI past-period contribution, reason, amounts, status, TRRN; interest and damages) | T3 panel | M03 YX-PAY-51, P07 YX-STAT-26 | PA | 3 | D |

### 2.7 Performance (PRF) — M06

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PRF-01 | Performance home | T6 | UI ref 07 #1 | Emp, Mgr, HR | 5 | D+M |
| PRF-02 | My goals (tree / alignment, KR progress rings) + goal check-in | T6 / T4 | M06 §7 | Emp, Mgr | 5 | D+M |
| PRF-03 | Company goal map | T6 | UI ref 07 #5 | HR, Exec | 5 | D |
| PRF-04 | Cycles: set-up + control room (clickable funnel) | T5 / T6 | M06 §7 | HR | 5 | D |
| PRF-05 | Review workspace (stage stepper, sections, advisory peer panel, band) | T3 | M06 §7 | Emp, Mgr | 5 | D |
| PRF-06 | Review acknowledgement (comment, disagreement flag) | T4 | M06 Q2 | Emp | 5 | D+M |
| PRF-07 | 360° nominations | T4 | M06 Q4 | Emp, Mgr | 5 | D+M |
| PRF-08 | Quick feedback (give / received) | T4 | M06 §7 | all | 5 | D+M |
| PRF-09 | Calibration board (+ 9-box view in wave 6) | T6 | M06 §7, Q5 | HR, Mgr | 5 (9-box 6) | D |
| PRF-10 | Comp review sheet | T6 | M06 §7 | Mgr, HR, Fin | 5 | D |
| PRF-11 | 1:1s (list + record: agenda, shared / private notes, actions linked to goals) | T2 / T3 | M06 §7 | Emp, Mgr | 5 | D+M |
| PRF-12 | PIP record (+ employee acknowledgement) | T3 | M06 Q7 | Mgr, HR, Emp | 5 | D+M |
| PRF-13 | Hand-over list (manager change) | T2 | M06 §7 | Mgr, HR | 5 | D |
| PRF-14 | Competency framework | T3 | M06 Q8 | HR | 5 | D |

### 2.8 Learning (LRN) — M07

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| LRN-01 | My learning (assigned, continue, certificates) + catalogue | T2 / T8 | M07 §7 | Emp | 5 | D+M |
| LRN-02 | Course player (self-paced, SCORM) | T3 | M07 Q1 | Emp | 5 | D+M |
| LRN-03 | Course builder + learning paths | T3 | M07 §7 | L&D | 5 | D |
| LRN-04 | Sessions (list + page: attendees, attendance, results, feedback, cost) + trainer master | T3 | M07 §7 | L&D, Trn | 5 | D |
| LRN-05 | Trainer QR attendance screen | T8 | M07 Q7 | Trn | 5 | M |
| LRN-06 | Nomination / enrolment / external training request (+ decline) | T4 | M07 Q2 | Mgr, L&D, Emp | 5 | D+M |
| LRN-07 | Assignment rules | T3 | M07 Q3 | L&D | 5 | D |
| LRN-08 | Compliance dashboard (department × mandatory course) | T6 | M07 §7 | L&D, HR | 5 | D |
| LRN-09 | Team skills matrix | T6 | M07 §7 | Mgr | 5 | D |
| LRN-10 | Skills profile | T3 | M07 YX-LRN-03 | Emp, Mgr | 5 | D+M |
| LRN-11 | Training needs board + budgets | T2 | M07 Q4, Q5 | L&D, Fin | 5 | D |
| LRN-12 | Session feedback + 60-day manager check | T4 | M07 Q8 | Emp, Mgr | 5 | D+M |
| LRN-13 | My tests (assigned tests, start link, results) | T8 | M04 D2, T03 D2 | Emp | 5 | D+M |

### 2.9 Helpdesk, cases & policies (HLP) — M08

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| HLP-01 | Help centre (KB search, AI assistant, raise ticket, my tickets with SLA) | T8 / T2 | M08 §7 | Emp | 5 | D+M |
| HLP-02 | Agent desk (queue views, SLA badges) | T2 | M08 §7 | Agt | 5 | D |
| HLP-03 | Ticket workspace (macros, internal notes) | T3 | M08 §7 | Agt | 5 | D |
| HLP-04 | Knowledge base editor | T3 | M08 (G5) | Agt, HR | 5 | D |
| HLP-05 | SLA dashboard | T6 | M08 YX-HD-02 | QL | 5 | D |
| HLP-06 | Speak-up: file grievance / whistleblower report (named or anonymous, access code shown once) | T4 | M08 Q3, Q8, YX-CASE-11 | Emp | 5 | D+M |
| HLP-07 | My cases (as complainant / respondent, show-cause reply) | T2 / T4 | M08 Q5 | Emp | 5 | D+M |
| HLP-08 | Case list + case workspace for case members (grievance, disciplinary, whistleblower; members, due banner, anonymous messages) | T3 | M08 §7 | case team | 5 | D |
| HLP-09 | Ethics desk (whistleblower queue, routing to audit committee) | T2 | M08 Q8 | EO | 5 | D |
| HLP-10 | Policy library + acknowledgement (click / OTP / quiz) | T2 / T4 | M08 §7 | Emp | 5 | D+M |
| HLP-11 | Policy admin (versions, audience, re-acknowledge, ack %) | T3 / T6 | M08 §7 | HR | 5 | D |
| HLP-12 | **Accident case workspace** with statutory panel (report, injured person, witnesses, injury leave link; ESIC accident report / reportable-accident notice due clocks; EC claim and compensation) | T3 | M08 YX-CASE-14…16 | Safety officer, HR, case team | 4 | D+M |

### 2.10 Engage (ENG) — M09, P04

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| ENG-01 | Feed (space filter, pinned, polls, celebrations) + spaces directory | T2 | M09 §7, Q1 | all | 5 | D+M |
| ENG-02 | Post composer (update, poll, event) | T4 | M09 §3 | all | 5 | D+M |
| ENG-03 | Announcement composer (audience, channels, acknowledgement) + ack tracking | T4 / T2 | P04 §7, Q8 | HR, announcers | 1 | D |
| ENG-04 | Surveys list + survey builder (question library, preview, anonymity mode) | T2 / T5 | M09 §7 | HR | 5 | D |
| ENG-05 | Take survey / pulse / eNPS | T4 | M09 §3 | Emp | 5 | D+M |
| ENG-06 | Survey results (eNPS gauge, heatmap, comment themes, suppression) | T6 | M09 §7 | HR, Mgr | 5 | D |
| ENG-07 | Action plans | T3 | M09 Q8 | Mgr, HR | 5 | D+M |
| ENG-08 | Give kudos | T4 | M09 §7 | all | 5 | D+M |
| ENG-09 | Recognition wall + leaderboard (company can switch off) | T6 | M09 §7 | all | 5 | D+M |
| ENG-10 | Rewards (points, catalogue, redeem) | T2 | M09 Q4 | Emp | 5 | D+M |
| ENG-11 | Moderation queue | T2 | M09 §7 | Mod | 5 | D |

### 2.11 Hiring & staffing desk (HIR) — M10 (exam-app ATS)

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| HIR-01 | Headcount plan board | T6 | M10 §7 | HR, Fin, HM | 7 | D |
| HIR-02 | Requisitions (in / outside plan) | T2 | M10 Q1 | HM, Rec | 7 | D |
| HIR-03 | Jobs + job workspace (existing, P01 masters) | T2 / T3 | M10 §2 | Rec | 7 | D |
| HIR-04 | Pipeline board (rich cards: stage age, scores, next action) | T6 | M10 §7 | Rec, HM | 7 | D |
| HIR-05 | Candidate record (+ merge; **"Ex-employee"** banner from application through screening, M01 YX-LC-29) | T3 | M10 YX-ATS-03 | Rec | 7 | D |
| HIR-06 | Interview calendar (existing) | T6 | M10 §2 | Rec, Int | 7 | D |
| HIR-07 | Scorecard form | T4 | M10 §7 | Int | 7 | D+M |
| HIR-08 | AI interview review player | T3 | M10 §7 | Rec | 7 | D |
| HIR-09 | Offer builder (CTC breakup, versions, re-approval) | T5 | M10 §7 | Rec, HR | 7 | D |
| HIR-10 | BGV tracker | T2 | M10 Q5 | HR, Rec | 7 | D |
| HIR-11 | Recruiting costs entry | T2 | P09 Q3, GAP H1 | Rec | 7 | D |
| HIR-12 | Referrals (refer, my referrals, bonus status) | T4 / T2 | M10 §2 | Emp | 7 | D+M |
| HIR-13 | Internal jobs (browse, apply) | T2 | M10 §2 | Emp | 7 | D+M |
| HIR-14 | Clients (list + workspace: contacts, contracts, SLAs) | T2 / T3 | M10 §7 | AM | 7 | D |
| HIR-15 | Rate cards | T3 | M10 Q7 | AM | 7 | D |
| HIR-16 | Submissions board | T6 | M10 §7 | AM, Rec | 7 | D |
| HIR-17 | Placements (record, extend / end) + bench board | T2 / T3 | M10 §7, YX-ATS-15 | AM | 7 | D |
| HIR-18 | Invoices (GST, credit notes) | T2 / T3 | M10 Q7 | Fin, AM | 7 | D |
| HIR-19 | Receivables & collections (ageing, dunning, disputes) | T7 | M10 YX-ATS-16 | Fin | 7 | D |
| HIR-20 | **Talent CRM** (pools, nurture campaigns and sequences, consent status, job-board postings, sourcing-extension captures) | T2 / T3 | M10 §11 B8 | Rec | 7 | D |
| HIR-21 | Staffing **vendors** (register, job sharing with rate cap, vendor submissions, scorecards) | T2 / T3 | M10 §11 C7 | AM | 7 | D |
| HIR-22 | **Identity strip** on the application, AI-interview review player (HIR-08) and panel scorecard (HIR-07): capture point, match result per step, deepfake / voice-clone flag with review | T1 strip | M10 YX-ATS-32, T04 YX-PROC-19 / 20 | Rec, Int | 7 | D |

### 2.12 Proctoring (PRC) — T01–T05 (exam app)

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PRC-01 | Question bank explorer (facets, bulk) + library packs | T2 | T01 §7, Q7 | TO | PT | D |
| PRC-02 | Question editor (rich blocks, live candidate preview, language switcher, versions, item stats) | T3 | T01 §7 | TO | PT | D |
| PRC-03 | Question review queue (version diff, comment per field) | T2 | T01 §7 | Rev | PT | D |
| PRC-04 | Test builder (stepper, blueprint grid) + adaptive config with simulation | T5 | T02 §7 | TO | PT | D |
| PRC-05 | Item analysis dashboard | T6 | T02 §7 | TO | PT | D |
| PRC-06 | Candidate score report | T3 | T02 §7 | Rec, TO | PT | D |
| PRC-07 | Invitations & drives (existing) | T2 | T03 | Rec | PT | D |
| PRC-08 | Slot calendar with capacity | T6 | T03 §7 | Rec | PT | D |
| PRC-09 | **Drive capacity planner** (expected load vs capacity, waves) | T6 | T03 §7 | Rec, TO | PT | D |
| PRC-10 | **Connectivity panel** per attempt (lost time, credits, approve extra) | T3 | T03 §7 | Pr, TO | PT | D |
| PRC-11 | **Accommodation review queue** | T2 | T03 §7 | Rev, HR / L&D | PT | D |
| PRC-12 | Proctoring settings (mode picker, plain summary, action matrix) | T3 | T04 §7 | TO | PT | D |
| PRC-13 | **Live console** (tiles sorted by concern, shortcuts, 1:N) | T6 | T04 §7 | Pr | PT | D |
| PRC-14 | **Proctor planner** (shifts vs booked slots, tenant / YukthiX pool) | T6 | T04 §7 | Pr lead | PT | D |
| PRC-15 | Company audit view (YukthiX-proctor actions per slot) | T2 | T04 §7, YX-PROC-12 | SA | PT | D |
| PRC-16 | Integrity review queue | T2 | T05 §7 | Rev | PT | D |
| PRC-17 | **Incident workspace** (synchronised playback, flag timeline, verdict) | T3 | T05 §7 | Rev | PT | D |
| PRC-18 | Appeals queue | T2 | T05 Q2 | Rev | PT | D |
| PRC-19 | **Evaluator console** (rubric panel, keyboard scoring, blind mode) | T3 | T05 §7 | Ev | PT | D |
| PRC-20 | Integrity reports (collusion, plagiarism, inter-rater agreement) | T7 | T05 Q3/Q4 | TO | PT | D |
| PRC-21 | **Candidate portal** home (my tests, booking, reschedule, status) | T9 | T03 §7 | Cand | PT | W |
| PRC-22 | **Readiness check** + practice test | T9 | T03 Q7 | Cand | PT | W |
| PRC-23 | Accommodation request (evidence upload) | T9 | T03 Q8 | Cand | PT | W |
| PRC-24 | Consent and "what we record" panel | T9 | T04 §7, T05 Q8 | Cand, Emp | PT | W |
| PRC-25 | ID check, room scan and companion-phone pairing | T9 | T04 §7 | Cand | PT | W |
| PRC-26 | Test runner (connection status, saved ✓, proctor status bar, breaks, accessibility settings) | T9 runner | T03 §7 | Cand, Emp | PT | W |
| PRC-27 | Result page + appeal | T9 | T05 §7 | Cand | PT | W |
| PRC-28 | **Privacy centre** (consents, retention dates, withdraw / erase) | T9 | T05 §7 | Cand | PT | W |
| PRC-29 | **Campus drive kit** (institution master, registration-portal settings, admit cards, college-wise reports) | T2 / T6 | T03 §11 B7 | Rec, TO | PT | D |
| PRC-30 | **Invigilator app** (test-centre check-in, ID check, seat plan, incident log, offline sync status) | T8 | T03 §11 C5 | Invigilator | PT | M |
| PRC-31 | **Candidate app** (native: my tests, booking, readiness, proctored runner, results, privacy centre) | T8 | T03 §11 B7 | Cand | PT | M |

### 2.13 Analytics (ANL) — P09, 11-analytics

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| ANL-01 | Analytics home (mine, shared, templates, library) | T6 | P09 §7 | desk users | 1→ | D |
| ANL-02 | Role dashboards: Executive, HR, Payroll / Finance, Recruiter, Department head, Manager; plus compliance owner, L&D, helpdesk lead, ethics / IC, staffing head, expenses, System Admin ops (GAP H5) | T6 | 11-analytics §6.2 | per role | 1→ | D (M cards wave 6) |
| ANL-03 | Dashboard builder (widget wizard metric → dimension → period → chart; share) | T6 | P09 §7 | HR, PA, SA, dept heads | 1→ | D |
| ANL-04 | Metric explorer | T6 | 11-analytics §6.2 | same | 1→ | D |
| ANL-05 | Report builder | T7 | P09 §7 | same | 1→ | D |
| ANL-06 | Report library (grouped by question, search, favourites) | T2 | P09 §7, GAP F4 | desk users | 1→ | D |
| ANL-07 | Metric catalogue + calculated-metric builder | T2 / T3 | P09 §7, Q5 | all / HR, PA | 1→ | D |
| ANL-08 | Schedules & subscriptions + export log | T2 | P09 §7 | desk users, Aud | 1→ | D |
| ANL-09 | Ask analytics (AI) | T3 | P09 Q8 | desk users | 5 | D |

### 2.14 External portals (T9) — see §4

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| T9-01 | Pre-boarding portal (welcome, forms, uploads, e-sign, bank, regime, LOI / offer) | T9 | M01 §3.5 | Cand (pre-boarder) | 4 | W |
| T9-02 | Alumni + nominee portal (own payslips, Form 16, letters; nominee: F&F statement, claim documents) | T9 | P05 Q6, YX-DOC-16/19 | Alm, Nom | 4 | W |
| T9-03 | External trainer portal (own sessions) | T9 | M07 Q6 | Trn | 5 | W |
| T9-04 | POSH IC external member portal (+ external-party complainant, E16) | T9 | M08 Q4, E16 | IC external, external party | 4 | W |
| T9-05 | Audit-committee chair portal | T9 | M08 Q8 | ACC | 5 | W |
| T9-06 | Client portal (jobs, submissions, interviews, timesheets, invoices, tickets) | T9 | M10 Q8 | Cli | 7 | W |
| T9-07 | Anonymous reporter case page (access code, status, replies) | T9 access-code | M08 E20, YX-CASE-11 | anonymous reporter | 5 | W |
| T9-08 | Public verify page (letter / certificate QR) | T9 public | P05 §7, YX-DOC-11 | Pub | 1 | W |
| T9-09 | Careers site (existing; ASCII slugs, tenant brand) | T9 public | M10 YX-ATS-02 | Pub | 7 (exists) | W |
| T9-10 | Developer portal (reference, guides, changelog, status, sandbox sign-up) | own docs site | P11 §7 | Dev | 3 | W |
| T9-11 | **Campus registration portal** (+ college-coordinator view, own college only) | T9 public / OTP | T03 §11 B7 | Cand, college coordinator | PT | W |
| T9-12 | **Staffing vendor portal** (shared jobs, submissions, status, invoices) | T9 | M10 §11 C7 | vendor contact | 7 | W |
| T9-13 | **Contract-labour vendor portal** (worker lists, monthly challans, wage registers, licence renewals) | T9 | M13 | contractor contact | per M13 | W |
| T9-14 | **Visitor invite page** (pre-registration, ID, photo, visitor privacy notice, QR pass) | T9 link | M02 §B11 | visitor | 6 | W |
| T9-15 | Candidate identity verification / re-verification page (consent, ID + selfie; used for application verification and when a later match fails) | T9 link | M10 YX-ATS-32, T04 YX-PROC-19 | Cand | 7 / PT | W |
| T9-16 | Public help centre **help.yukthix.com** (search, versioned articles, captioned videos per product, "was this helpful") | T9 public | P20 YX-GRO-07 | Pub, all | before public launch | W |
| T9-17 | Public **status page** (per product and region: current status, incidents, maintenance, history, subscribe) | T9 public | P20 YX-GRO-08 / 09, P13 | Pub | before public launch | W |

(The candidate test portal is PRC-21 … PRC-28.)

### 2.15 YukthiX internal console (YX) — P07

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| YX-01 | Rule-set editor (grid for slabs) + source upload | T3 | P07 §7 | YX compliance owner | 1 | D |
| YX-02 | Golden-case runner + review queue (maker / checker) | T2 | P07 §7 | YX | 1 | D |
| YX-03 | Publish scheduler + tenant impact report | T5 | P07 §7 | YX | 1 | D |
| YX-04 | **Customer-success console** (tenant health list, churn-risk alerts, admin message composer with second approval) | T2 / T6 | P14 §6 flow 6 (C8) | YX CS | before public launch | D |
| YX-05 | **AI governance console** (model / prompt registry, eval runs, drift, bias, red-team log, promotion gate) | T3 / T6 | P10 (B13), P09 YX-MET-17 | YX AI lead | 5 | D |
| YX-06 | **Partner verification** (applications queue: identity, GSTIN / PAN, ICAI registration, agreement G-34; partner list with types and hierarchy; suspend / reinstate) | T2 / T3 | P16 §6 flow 1, YX-PTR-01, P14 §7 | YX partner team | 3 | D |
| YX-07 | **Partner commissions & invoices** (monthly accruals linked to client invoices, approval, payouts; consolidated partner invoices) | T2 | P16 YX-PTR-11, P14 §7 | YX billing | 3 | D |
| YX-08 | **Partner directory** moderation (listings, verified reviews, complaints; no paid ranking) | T2 | P16 YX-PTR-14, G-35 | YX partner team | 3 | D |
| YX-09 | **Product analytics** dashboards (funnel, time to first value, cohort retention, feature adoption, quick-start drop-off; pseudonymous only) | T6 | P09 §4.10, P20, APX-C RPT-YX-01…05 | YX growth, product | before public launch | D |
| YX-10 | **Incident & maintenance composer** + status admin (stage templates, affected products / regions, second approval, status components) | T3 | P20 YX-GRO-08 / 09, P14 YX-CONSOLE-07 | YX SRE, support lead | before public launch | D |
| YX-11 | Help-centre editor (articles, versions, videos, search no-result list, feedback) | T3 | P20 YX-GRO-07 | YX support | before public launch | D |
| YX-12 | Nudge & "switch on" copy editor (per day and trigger, preview, A/B off by default) | T3 | P20 YX-GRO-03 / 04 | YX growth | before public launch | D |
| YX-13 | Sales-assist queue ("talk to us" requests, owner, SLA, outcome) | T2 | P20 YX-GRO-05 | YX sales | before public launch | D |
| YX-14 | Export invoices, LUT & FIRC / e-BRC reconciliation (LUT register, export invoices, foreign receipts matching queue) | T2 / T3 | P14 YX-BILL-16 / 17 | YX billing | before public launch | D |

### 2.16 Mobile shell (MOB) — M04 (flows per tab in §5)

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| MOB-01 | First run (OTP sign-in, language, notifications, device binding, install) | T8 | M04 §6 | Emp | 2 | M |
| MOB-02 | Tab bar + Home (Today card, to-dos, quick actions; Team segment for managers) | T8 | M04 §3, Q5 | Emp, Mgr | 2 | M |
| MOB-03 | Me › Settings & security (language, notification matrix, quiet hours, devices, remote sign-out, re-auth) | T8 | M04 Q8, P04 §7 | Emp | 2 | M |

### 2.17 Projects (PRJ) — M12

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PRJ-01 | Projects list + project workspace (overview, team & allocations, tasks & milestones, timesheets, billing) | T2 / T3 | M12 §7 | PM, Fin, HR | 5 | D |
| PRJ-02 | Timesheet approvals by project and week (bulk within allocation) | T2 | M12 §7 | PM | 5 | D+M |
| PRJ-03 | Capacity & utilisation board (people × weeks heatmap, targets) | T6 | M12 §7 | PM, HR | 5 | D |
| PRJ-04 | Project costing & margin | T7 | M12 §7 | Fin, PM | 5 | D |
| PRJ-05 | Billing workbench (WIP, create invoices on the M10 invoice engine) | T5 | M12 §7 | Fin | 5 | D |

### 2.18 Contract labour (CLB) — M13

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| CLB-01 | Contractors register (licence, CLRA registration, validity, renewal alerts) | T2 / T3 | M13, P07 `IN.CLRA` | HR, compliance owner | per M13 | D |
| CLB-02 | Contract workers register (deployment, site, gate pass, wages, PF / ESI numbers) | T2 | M13 | HR, site admin | per M13 | D |
| CLB-03 | Vendor compliance tracker (monthly challans, wage registers, verification status, principal-employer liability flags) | T6 | M13 | compliance owner, Fin | per M13 | D |
| CLB-04 | CLRA registers & returns | T7 | M13, P07 B17 | compliance owner | per M13 | D |
| CLB-05 | Convert contract worker to employee wizard (same person kept, role ended, employee created with carried-over identity and documents) | T5 | M13, P01 YX-ORG-26, M01 | HR | per M13 | D |

### 2.19 Visitors (VIS) — M02 §B11

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| VIS-01 | Visitor desk: today's visitors (expected, on site, checked out; host, badge) | T2 | M02 §B11 | reception, security | 6 | D |
| VIS-02 | Pre-register a visitor (host invite) + "my visitors" | T4 | M02 §B11 | Emp (host) | 6 | D+M |
| VIS-03 | Visitor kiosk (self check-in, photo, notice acknowledgement, badge / QR) | T8 kiosk | M02 §B11 | visitor | 6 | K |
| VIS-04 | Visitor log & reports (by location, host, purpose; retention countdown) | T7 | M02 §B11 | reception, security, HR | 6 | D |

### 2.20 Partner portal (PTR) — P16

Own shell (T1 layout with optional partner branding; no entity or period switcher, the client switcher PTR-09 instead). Partner users only (P02 §4.7 "Partner user").

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PTR-01 | **Clients** (list with health, payroll status per month, compliance status; search; create a client tenant or request a link; ownership shown) | T2 | P16 §7 | Ptr | 3 | D |
| PTR-02 | **Cross-client compliance calendar** (PF, ESI, PT, LWF, TDS, 24Q / 26Q, registers; due / late / filed; filters by statute / state / status; status feed only, YX-PTR-07) | T6 | P16 §3, §7 | Ptr | 3 | D |
| PTR-03 | Tasks board across clients (type, due, owner, SLA; linked to calendar items and payroll runs) | T2 | P16 §3 | Ptr | 3 | D |
| PTR-04 | Requests (document requests to clients: payroll inputs, investment proofs; P05 document requests) | T2 | P16 §3, P05 | Ptr | 3 | D |
| PTR-05 | Templates (salary structures, letter templates, import mappings; "copy into client", YX-PTR-09) | T2 / T3 | P16 §3 | Ptr admin | 3 | D |
| PTR-06 | Team (partner users, roles, client assignments, MFA / SSO policy) | T2 / T3 | P16 §3, YX-PTR-06 | Ptr admin | 3 | D |
| PTR-07 | Billing & commission (billing mode per client, consolidated partner invoices, commission statements, sub-partner roll-up totals) | T2 | P16 YX-PTR-10 / 11 | Ptr admin | 3 | D |
| PTR-08 | Profile (firm details and types, verification status, agreement G-34, branding, directory listing G-35) | T3 | P16 §3, Q5 | Ptr admin | 3 | D |
| PTR-09 | Client switcher + persistent "Working in: Client X as Partner Y" banner (enters the client tenant under the grant; audited, YX-PTR-04) | T1 overlay + banner | P16 §7 | Ptr | 3 | D |

### 2.21 Validation pass 3 Shoulds (28 Sep 2026)

Screens for the Should items of validation pass 3 (M01, M02, M03, M06, M07, M08, M13, P07, P10, P19, P21, T02, T03, T05; second catalogue pass: M10, M12, P12, P14, P20). Numbers continue each area's series; each screen counts in its area's total.

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PAY-29 | Weekly / fortnightly pay run (run list per frequency; readiness, payslip and bank-file steps as for monthly runs, frequency shown on every step) | T2 / T5 | M03 YX-PAY-53…63 | PA, Fin | 3 | D |
| PAY-30 | **Coverage monitor** panel on run readiness (establishments crossing PF / ESI / gratuity / bonus / CLRA thresholds, registration due) | T1 panel | P07 YX-STAT-27…32, M03 | PA, compliance owner | 3 | D |
| PAY-31 | Piece-rate cards and output import (rate cards per item / operation, output upload with validation preview, minimum-wage top-up check) | T2 / T5 | M03 YX-PAY-53…63 | PA, supervisor | 3 | D |
| PAY-32 | Incentive / commission plan builder (targets, slabs, accelerators, caps, clawback rule, effective dates) | T3 | M03 YX-PAY-53…63 | PA, Sales ops | 3 | D |
| PAY-33 | My incentive / commission statement (earned, paid, held, clawbacks) | T3 / T8 | M03 YX-PAY-53…63 | Emp | 3 | D+M |
| PAY-34 | Tips pool (pool period, collections, distribution basis, shares, send to run) | T2 / T3 | M03 YX-PAY-53…63 | PA, location manager | 3 | D |
| PAY-35 | On-call & standby pay rules (rates per slot and call-out, minimum paid hours, link to TIM-38) | T3 | M03 YX-PAY-53…63, M02 | PA | 3 | D |
| PAY-36 | Union check-off (authorisations, monthly deduction list, remittance per union) | T2 | M03 YX-PAY-53…63, M01 | PA, HR | 3 | D |
| PAY-37 | Wage-settlement arrears (settlement → categories → affected employees → arrears worksheet) | T5 | M03 YX-PAY-53…63, M08 YX-CASE-17/18 | PA, HR | 3 | D |
| PAY-38 | Actuarial census export and valuation upload (census versions, valuation results, provision posting) | T5 | M03 YX-PAY-53…63, APX-C RPT-PAY-21 | PA, Fin | 3 | D |
| PAY-39 | My pay band (own grade range and position in range, when the tenant turns pay-band visibility on) | T3 / T8 | M06 YX-PERF-20…22, APX-E | Emp | 5 | D+M |
| PPL-38 | Disability declaration (voluntary self-ID, reasonable adjustments; Special data) | T4 / T8 | M01 YX-EMP-14…18 | Emp, HR | 1 | D+M |
| PPL-39 | Union register (unions, recognition status, members, office bearers) | T2 / T3 | M01 YX-EMP-14…18 | HR | 4 | D |
| PPL-40 | VRS scheme (scheme set-up, eligibility, applications, approvals, scheme letters) | T2 / T3 | M01 YX-LC-32/33 | HR, Emp | 4 | D |
| PPL-41 | Buddy panel (buddy pool, assignment to joiners, check-ins) | T2 | M01 YX-LC-32/33 | HR, Mgr | 4 | D |
| PPL-42 | Re-verification cycles (BGV / document re-checks by role and interval, due list, outcomes) | T2 | M01 YX-EMP-14…18 | HR | 4 | D |
| PPL-43 | BFSI declarations (holdings, related persons, conflict of interest; periodic attestation) | T4 / T8 | M01 YX-EMP-14…18 | Emp, compliance officer | 4 | D+M |
| PPL-44 | Personal-trading pre-clearance (request, decision, validity window, trade report) | T4 / T2 | M01 YX-EMP-14…18 | Emp, compliance officer | 4 | D+M |
| TIM-37 | Industrial-action event (type, establishment, dates, workers affected, attendance and pay treatment) | T4 / T3 | M02 YX-AT-27…30 | HR | 2 | D |
| TIM-38 | Standby slots and call-out (roster slots, call-out log, rest-rule check) | T6 / T4 | M02 YX-AT-27…30 | Mgr, Emp | 2 | D+M |
| TIM-39 | Block-leave planner (roles in scope, planned blocks, access suspension confirmation) | T6 | M02 YX-LV-16 | HR, Mgr | 2 | D |
| TIM-40 | Licence requirements (licences per role / roster, holders, expiry, roster block) | T2 | M02 YX-AT-27…30 | HR, roster owner | 2 | D |
| TIM-41 | Hybrid policy and team office-day planner | T3 / T6 | M02 YX-AT-27…30 | HR, Mgr, Emp | 2 | D+M |
| HLP-13 | Collective dispute / settlement case (demands, conciliation stages, settlement terms, link to PAY-37) | T3 | M08 YX-CASE-17/18 | HR, IR lead | 5 | D |
| CLB-06 | Client establishments (for a contractor tenant: client sites, principal employer, deployment) | T2 / T3 | M13 YX-CLRA-15 | contractor admin | per M13 | D |
| CLB-07 | Own licences (contractor's CLRA licences per client establishment, validity, renewal) | T2 | M13 YX-CLRA-15 | contractor admin | per M13 | D |
| CLB-08 | Client compliance packs (monthly pack items per client, submission, acceptance) | T6 | M13 YX-CLRA-15 | contractor admin, compliance owner | per M13 | D |
| PLT-44 | Notice-of-change and policy-link panel (on a policy / rule change: notice required, draft notice, display / send, waiting period) | T1 panel | P19 YX-RULE-13/14 | HR, SA | 4 | D |
| PPL-45 | Work authorisations tab (permits and visas, sponsor, expiry, reminders) | T3 tab | P21 YX-GLB-01…16 | HR | 1 | D |
| PPL-46 | International bank details (IBAN / SWIFT / local formats, split-pay across accounts) | T3 tab | P21 YX-GLB-01…16 | HR, Emp | 1 | D+M |
| TIM-42 | Holiday feed settings (country / region public-holiday feed subscription, review before publish) | T3 | P21 YX-GLB-01…16 | HR | 2 | D |
| PLT-45 | Entity data region (region per legal entity, shown read-only after set) | T3 | P21, P01 YX-ORG-28…30 | SA | 1 | D |
| PLT-46 | Region-move request (request, impact, schedule, notice G-39, status) | T4 | P21, P02 YX-SEC-37/38 | SA | 1 | D |
| YX-15 | Region catalogue (regions, hosting status, in-country options) | T2 | P21, P13 | YX SRE | before public launch | D |
| YX-16 | E-invoice log (per country e-invoice submissions, status, errors, retries) | T2 | P21, P14 | YX billing | before public launch | D |
| LRN-14 | Skills library admin (starter taxonomy, synonyms, proficiency scale, role requirements) | T2 / T3 | M06 YX-PERF-20…22, M07 YX-LRN-15 | HR, L&D | 5 | D |
| LRN-15 | My skills: suggestions to confirm (from courses, projects, assessments; confirm / reject) | T3 / T8 | M07 YX-LRN-15 | Emp, Mgr | 5 | D+M |
| LRN-16 | AI course draft review (outline, sources, edits, publish) | T3 | M07 YX-LRN-15, P10 YX-AI-13/14 | L&D | 5 | D |
| PRF-15 | Appraisal dispute escalation and evidence export | T4 / T3 | M06 YX-PERF-20…22 | Emp, HR | 5 | D+M |
| PLT-47 | Copilot action card (proposed action, data used, confirm / edit / cancel; web, chat and WhatsApp) | T1 card | P10 YX-AI-13/14 | all | 5 | D+M+C |
| PLT-48 | Agent actions log (every AI-proposed and confirmed action, who confirmed, undo where allowed) | T2 | P10 YX-AI-13/14 | SA, Aud | 5 | D |
| PLT-49 | EOR connector setup (provider, countries, worker sync, invoices) | T5 | P10 YX-INT-12 | SA, HR | 7 | D |
| HIR-23 | Bias audit record (NYC LL144: audit date, auditor, impact ratios, published summary link) | T3 | T05 YX-EVAL-31/32, M10 | compliance owner | 7 | D |
| PRC-32 | Result-reuse consent (candidate: reuse a valid result for another job within the validity window) | T9 step | T02 YX-TB-19, T03 YX-DLV-22/23 | Cand | PT | W |
| HIR-24 | Job editor pay-range fields (min / max, currency, period; required where the location's law demands it, publish blocked otherwise) + pay-history question toggle | T3 panel | M10 YX-ATS-34 / 45 | Rec | 7 | D |
| HIR-25 | Interview notetaker consent (per-participant consent status; no consent, no recording) + draft-scorecard review from the transcript | T1 panel / T4 | M10 YX-ATS-37 | Rec, Int | 7 | D |
| HIR-26 | Rediscovery panel on the requisition (suggested past candidates and pool members, match reasons, contact / add to pipeline) | T1 panel | M10 YX-ATS-39 | Rec, HM | 7 | D |
| HIR-27 | Bulk interview-day scheduler (slots, panels, rooms, auto-assignment, bulk invites) | T6 | M10 YX-ATS-40 | Rec, campus team | 7 | D |
| HIR-28 | Bulk offer screen (one template, per-candidate values, preview, bulk approval and send) | T5 | M10 YX-ATS-40 | Rec, HR | 7 | D |
| HIR-29 | Offer conditions tab (conditions with due dates, evidence, met / waived, auto-lapse date) | T3 tab | M10 YX-ATS-41 | Rec, HR | 7 | D |
| HIR-30 | Placement fee & replacement-guarantee settings per client contract (fixed / % of CTC, conversion-fee taper, guarantee period, replace / refund) | T3 | M10 YX-ATS-43 | AM, Fin | 7 | D |
| HIR-31 | E-invoice window banner on invoices (days since invoice date, day-25 warning, blocked after day 30; also on PRJ-05) | T1 banner | M10 YX-ATS-44, M12 YX-PRJ-16 | Fin | 7 | D |
| T9-18 | Candidate automation notice + consent page (what is automated and why, consent, link to request an alternative process) | T9 link | M10 YX-ATS-35 | Cand | 7 | W |
| T9-19 | Alternative-process and deletion request form (candidate request, status, 30-day deletion confirmation) | T9 link | M10 YX-ATS-35 | Cand | 7 | W |
| T9-20 | WhatsApp / careers-site chatbot apply flow (channel consent, knockout questions, opt-out) | T9 chat | M10 YX-ATS-36 | Cand | 7 | W |
| T9-21 | Referee questionnaire (secure link, structured questions, consent, submit) | T9 link | M10 YX-ATS-38 | referee | 7 | W |
| PRJ-06 | Timesheet correction on invoiced time + credit-note / supplementary-invoice screen (linked to the original invoice, margin restated) | T5 | M12 YX-PRJ-15 | PM, Fin | 5 | D |
| PRJ-07 | Bench board + resource requests (bench status and ageing; request → match → confirm) | T6 / T2 | M12 YX-PRJ-17 | PM, resource manager | 5 | D |
| PLT-50 | What's new feed (dated entries per product, targeted by role and product switched on; in the Help drawer) | T1 drawer | P20 YX-GRO-11 | all | before public launch | D+M |
| PLT-51 | Feature requests, voting & beta programmes (raise, vote once, status; beta opt in / out) | T2 / T3 | P20 YX-GRO-12 | SA, all | before public launch | D |
| PLT-52 | Cancellation flow with save offers (reason list + free text, save offers, confirm switch-off) | T5 | P20 YX-GRO-13 | SA | before public launch | D |
| PLT-53 | Referral page (company referral link / code, referred companies, credits earned / pending) | T3 | P20 YX-GRO-14, P14 YX-BILL-21 | SA | before public launch | D |
| PLT-54 | Go-live payout readiness checklist (mandate status, grace run, funding, KYB, balance; payout blocked / partial reasons) | T5 | P14 YX-BILL-18 | SA, PA | before public launch | D |
| T9-22 | Public roadmap (requests by status, voting for signed-in users) | T9 public | P20 YX-GRO-12 | Pub | before public launch | W |
| T9-23 | Public calculators and letter generators (P07 versioned calculators, FY shown) | T9 public | P20 YX-GRO-15 | Pub | before public launch | W |
| T9-24 | Integrations directory (partner, category, data moved, direction, status) | T9 public | P20 YX-GRO-16 | Pub | before public launch | W |
| T9-25 | Academy (admin and partner courses, certification, public certificate verify) | T9 | P20 YX-GRO-17 | SA, Ptr, Pub | after public launch | W |
| YX-17 | Cost per tenant (storage, egress, AI, compute beside revenue and margin; cost-share alerts) | T2 / T7 | P14 YX-CONSOLE-09, APX-C RPT-YX-11 | YX finance, SRE | before public launch | D |
| YX-18 | Contain tenant (reason, step-up, scope, lift) + tenant-side incident banner | T4 / T1 banner | P12 YX-SECOPS-12 | YX security on-call, SA (own tenant) | before public launch | D |

### 2.22 P22 Workflow Studio & AI assistant (28 Sep 2026)

Screens for [P22](P22-workflow-studio-ai-assistant.md) (YX-WFS-01…20) and P10 YX-AI-15; numbers continue the PLT series. Settings live on the existing page **1.8 Policies, rules & automations** (P22's "Settings › Automation"), so no settings page is added.

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PLT-55 | Workflow Studio canvas (trigger → steps → branches, waits with timeout, loops with max count, error handling per step; simple mode opens P19 automations as one-step workflows) | T3 | P22 YX-WFS-01 / 06 / 08 / 09 | SA, workflow owner | 2 | D |
| PLT-56 | Template gallery (starter cards with description and "Use this"; YukthiX template updates offered, never applied without acceptance) | T2 | P22 YX-WFS-20 | SA, workflow owner | 2 | D |
| PLT-57 | Test and preview panel (sample records picker, step-by-step trace, P19 impact preview stored with the version) | T1 drawer | P22 YX-WFS-03, P19 YX-RULE-07 | SA, workflow owner | 2 | D |
| PLT-58 | Version history and diff (versions, author, second approver, change note, diff, re-publish) | T3 | P22 YX-WFS-04 / 05 | SA, workflow owner, approver | 2 | D |
| PLT-59 | Run log and failure queue (filter by status; retry / skip / stop; kill switch per workflow) | T2 | P22 YX-WFS-07 / 09 / 12 | SA, workflow owner | 2 | D |
| PLT-60 | Run detail with undo (steps with input / output, reversible and irreversible lists, conflicts, confirm undo) | T3 / T4 | P22 YX-WFS-10 / 19 | SA, workflow owner | 2 | D |
| PLT-61 | Script editor (code editor with SDK types, static-check results, service identity and scopes, test console) | T3 | P22 YX-WFS-13 / 14 / 15 | SA, developer admin | 6 | D |
| PLT-62 | AI assistant build panel (side panel in Studio: plain request → draft workflow or script, explanation, impact preview; publish stays with a person) | T1 drawer | P22 YX-WFS-16 | SA, workflow owner | 5 | D |
| PLT-63 | Agent plan card (do mode in the app shell and copilots: steps, records, APIs, irreversible and always-confirm markers, Approve plan) | T1 card | P22 YX-WFS-17 / 18, P10 YX-AI-15 | all (own permissions) | 5 | D+M |
| PLT-64 | Plan progress and summary (step progress, always-confirm steps handed to the app's own screen, result summary, Undo) | T1 card | P22 YX-WFS-17 / 18 / 19 | all (own permissions) | 5 | D+M |

### 2.23 P23 Employee & manager assistants and marketplaces (28 Sep 2026)

Screens for [P23](P23-employee-manager-assistants-marketplaces.md) (YX-AST-01…19); numbers continue each area's series. No settings page is added: settings go on existing pages (**5.7** Policies, **3.11** Projects & timesheets, **6.3** Performance, **4.5** Tax, **4.11** Benefits & FBP, **7.5** Calendar & chat, **7.6** AI; see the Settings map and the owning-doc table).

| # | Screen | Tmpl | Doc | Personas | Wave | Where |
|---|---|---|---|---|---|---|
| PAY-40 | **"Why is my pay different?"** on the payslip viewer (PAY-21): diff card per changed line with cause and source link, "not explained" row with **Raise payslip query**, chat panel (wave 5; own payslip only) | T1 drawer | P23 YX-AST-03 / 04 / 05 | Emp | 3 (chat 5) | D+M |
| HLP-14 | **Settings › Policies › Write with AI**: questionnaire, draft editor with clause source tags (law / company / AI), P07 law-floor findings per state, **Approve & load** (P19 impact preview, M08 version), "Not legal advice" banner | T3 | P23 YX-AST-06 / 07 | HR, SA | 5 | D |
| TIM-43 | **My timesheet › Pre-fill from my tools**: connect / revoke Google or Microsoft Calendar, Jira, GitHub (read-only), suggestion rows marked rule / AI with Accept / Edit / Reject; Submit stays manual (on TIM-15) | T1 drawer | P23 YX-AST-08 / 09 | Emp | 5 | D+M |
| PRJ-08 | Timesheet mapping rules (source pattern → project / task, priority, test against last week's items; Settings 3.11) | T2 / T3 | P23 YX-AST-09 / 18 | HR, project managers | 5 | D |
| PRF-16 | **Manager coach card** on manager home (weekly nudges with Act / Dismiss, opt-out link) and **suggested 1:1 agenda** panel in the 1:1 screen | T1 card / panel | P23 YX-AST-10 | Mgr | 5 | D+M |
| PRF-17 | Review form **"Help me draft"** and inline bias flags (gendered / personality / age / vague / inconsistent) with Accept / Ignore; the manager's text and rating stay final | T1 panel | P23 YX-AST-11 | Mgr | 5 | D |
| PAY-41 | **Compare tax regimes** panel in the tax workspace (PAY-22): old vs new regime from the P07 `IN.TDS` version, what-if sliders, "Estimate, not tax advice"; the employee chooses in declarations | T1 panel | P23 YX-AST-05 / 12 | Emp | 3 | D+M |
| PAY-42 | **Suggest split** on the compensation / offer screen: options side by side (components, take-home, employer cost, law checks), choose; stale badge after a law change | T1 drawer | P23 YX-AST-13 | HR, PA, Rec | 3 | D |
| PAY-43 | **Benefits › Group health**: eligibility (minimum headcount), partner name and IRDAI licence, distribution disclosure (APX-G G-45), neutral quote table, buy on the partner's screen, endorsement status | T2 / T3 | P23 YX-AST-14 / 15, M11 | HR, owner | 5 | D |
| ENG-12 | **Employee app › Perks**: category tabs, "Partner offer" labels, offer detail, consent sheet at redemption (fields to share, APX-G G-46), code; hidden when perks are off | T2 / T8 | P23 YX-AST-16 | Emp | 5 | D+M |

**Total: 64 PLT + 46 PPL + 43 TIM + 43 PAY + 9 EXP + 12 CMP + 17 PRF + 16 LRN + 14 HLP + 12 ENG + 31 HIR + 32 PRC + 9 ANL + 25 T9 + 18 YX + 3 MOB + 8 PRJ + 8 CLB + 4 VIS + 9 PTR = 423 screens** (413 before P23, §2.23; 403 before P22, §2.22; 378 before the second Should catalogue pass; 334 before validation pass 3 Shoulds, §2.21; 311 before validation pass 3; 249 before the 26 Sep 2026 extension; 290 before the P16 follow-up; 303 before the P19 follow-up; 310 before the market-analysis addition PLT-38). Each row is one screen (a list and its record, or a sheet and its bulk variant, share a row when they are one route).

---

## 3. Settings map

**Rules.**
1. **Eight top-level groups**, each a T1 page with a left list of its pages. A module's gear shortcut opens its page here.
2. **Every configurable policy in the design docs appears on exactly one page** (D17: a policy without an editor is a hard-coded policy). Other pages **link** to it, never duplicate it.
3. Every value shows its **source scope** ("inherited from Workfox Pvt Ltd", YX-ORG-12) and override / reset per scope (P01 §4.6 scopes, YX-ORG-18); `dated: true` settings show "valid from" and history.
4. Values seeded from a **starter template** carry the label "YukthiX starter — edit for your company" until changed (P01 D17). Legal values (P07) are never settings; they appear read-only with a "set by law" chip and a link to the rules browser.
5. **Settings search** (P01 §4.6, fixes U90): the settings registry (key, plain label, synonyms, module, page, allowed scopes, sensitivity) is indexed; results show label · page · current value · source scope and deep-link to the field (highlighted). Search also finds pages by task words ("probation", "late coming", "PF ceiling"). Only settings the viewer may manage are returned.
6. Editing a settings page needs that module's admin permission; approval-policy and payroll pages follow P03 YX-WF-16. Every change is audited (P08) with before / after.

**Legend:** (S) = shipped as a starter template (D17) · (d) = dated setting · (prop.) = from a proposed, undecided doc.

### Group 1 · Organisation

| Page | Settings on this page | Doc |
|---|---|---|
| 1.1 Company & branding | Company name, logo, brand colour (`--org-primary`), white-label domain and email sender (P11 Q7), tenant default language and locale, data region (read-only after sign-up) | P01, P11 Q7, P02 Q7, P04 Q4 |
| 1.2 Legal entities | Entities, default entity, statutory IDs summary (edited in 4.7), entity close / merge (runs PPL-09) | P01 §4.1, YX-ORG-22 |
| 1.3 Locations | State, timezone, holiday calendar link, geofence (map, radius, multiple points), IP / Wi-Fi ranges, host-location use | P01 §4.2, §8, M02 Q6 |
| 1.4 Structure masters | Departments (tree, division flag), designations, grades (pay ranges, (d)), employment types and categories (statutory default overrides only where law allows), cost centres and splits, shared vs entity-only | P01 Q3, Q7, Q8, YX-ORG-15/20, M06 Q6 |
| 1.5 Employee records | Employee code mode and pattern, custom fields (type, section, sensitivity, self-edit), concurrent employment (off), reimbursement bank account allowed | YX-ORG-16, YX-EMP-03, P01 Q6, M01 Q4 |
| 1.6 Set-up hub | Module completeness cards, go-live checklist (reads every group) | P01 §7, GAP G1 |
| 1.7 Customisation | Custom objects, fields, layouts per role, custom request types, packages & promotion, "promotion required" (S), starter library, limits used | P18 (B20) |
| 1.8 Policies, rules & automations | Rule catalogue across modules (each module's Policies page, PLT-31, links here), lookup tables, validation rules per record type, automations, rule approval settings (second approver for pay, leave balances, access and visibility: always on), "promotion required" for rules (S: off), limits used | P19 (D19) |

### Group 2 · People & Access

| Page | Settings on this page | Doc |
|---|---|---|
| 2.1 Roles & access | Role templates and custom roles, field classes, manager view / approve scope, team-salary grant, raise-on-behalf holders and request types, `attendance.roster.manage`, `analytics.dashboard.build`, announcer permission, `workflow.policy.manage` | P02 Q2–Q5, D5, D2, P09 Q4, M09 Q1 |
| 2.2 Directory & privacy | Directory fields, employee hide-own-fields, "Who accessed my data" on / off, small-group suppression threshold (3–10), external-login expiry per template, privacy notice publication | P02 Q4, P08 Q6, P02 Q2/P09 Q2, P02 §4.7, GAP H6 |
| 2.3 Security | Mobile session length (30 days default), re-auth on sensitive screens and idle time, support-access window default / max, MFA, SSO / SCIM, IP allow-list, password policy (prop. P12) | M04 Q8, P02 Q8, GAP A1 |
| 2.4 Approvals | Policies per request type (priority, conditions, steps, mode any / all / N, SLA reminders and escalation, auto-approve / reject for enabled low-risk types, skip conditions), out-of-app links on / off, risk level per type (raise only), approve-with-changes types, duplicate-approver auto-approve, automatic delegation during leave | P03 Q1–Q8 |
| 2.5 Onboarding & probation | Journey templates per entity / department / role, pre-boarding checklist items (required / optional), engagement touchpoints, probation length per type / grade, review lead days, max extension, auto-confirm after X days (off) | M01 Q2, Q3, E18 |
| 2.6 Job changes & transfers | Change types (letter, approval), transfer defaults (5 options) (S), mid-period method per change type / component (S), retro limit, deputation recharge defaults | YX-ORG-17, P06 Q5, Q6, M01 E8 |
| 2.7 Exit & lifecycle policies | Notice periods by grade / type / confirmation, early release and buy-out, offboarding templates and clearance departments, exit interview form, deprovisioning T+N days and plan-line release days, rehire policy (S), contract-end policy per type (S), retirement policy (S), sabbatical policy (S), absconding timeline (S), death-in-service support policy (S), open-case hold policy (S) | M01 Q6, §3.7, E-Q1, E-Q3, E-Q4, E3, E6, E7, E16, YX-LC-25 |
| 2.8 Assets | Asset categories, acknowledgement method, recovery defaults | M01 §3.6 |
| 2.9 Employee relations & cases | Grievance anonymous option, IC constitution per workplace (members, tenure, external member), misconduct matrix (S), show-cause reply days, warning expiry, whistleblower routing (ethics officer, audit-committee threshold / categories), case retention extension, legal hold | M08 Q3–Q5, Q7, Q8 |
| 2.10 Audit & data retention | Audit retention extension (≥ 8 years), retention schedule per data class, DSAR handling (prop. B12); per-person roles-and-retention breakdown in a DSAR (P01 YX-ORG-26) | P08 Q7, P02 §6 |
| 2.11 Partners | Linked partners (relationship type, ownership client / partner, named client contact), grant editor (modules, entities, actions; never Special data), approval-delegation switches per step (payroll approval, bank-file release, filing, DSC signing; starter: all client-side), access log, end link, ownership-transfer request / approval, partner directory (find a partner, send a link request), partner branding on the login page (consent) | P16 YX-PTR-02 / 03 / 05 / 13 / 14, Q5, Q6 |

### Group 3 · Time & Leave

| Page | Settings on this page | Doc |
|---|---|---|
| 3.1 Attendance modes | `attendance.mode` per group (d), `attendance.missing_punch_effect` block / warn (d) | M02 D1, P01 §4.6 |
| 3.2 Check-in & devices | Check-in methods per location / group (restricted / field), device binding (on for restricted staff), field-staff exemption, kiosk mode (PIN / QR, QR + PIN), face check-in opt-in and consent (wave 6) | M02 Q6, M04 Q3, Q4, P10 Q3 |
| 3.3 Shifts & patterns | Shifts (times, break rule, flexi / core, split, check-in window, grace, thresholds, allowances), OT policy per shift (minimum, rounding, pre / post approval, comp-off conversion), shift patterns, minimum rest, roster publishing | M02 §B2, Q2, Q3, Q7 |
| 3.4 Weekly offs | Precedence, location default, alternate Saturdays, nth weekday, custom | M02 Q1 |
| 3.5 Late & regularisation | Late penalty (off; N free, ½ day per N, deduction order) (S), regularisation limit and look-back, WFH / on-duty monthly limits, shift-swap consent | M02 Q4, Q5, §B4 |
| 3.6 Leave types | Per type: basics, eligibility, crediting, counting and sandwich, rules (notice, max, block dates, attachment after N days, negative limit), year end and encashment, statutory templates, long-absence accrual (S), during-notice behaviour (S), maternity company options (crèche check, post-maternity WFH), comp-off expiry | M02 §A2, L3–L6, E2, E3, E10 |
| 3.7 Leave policies | Bundles and assignment rules by entity / location / grade / type (d) | M02 §A2 |
| 3.8 Holiday calendars | Per location, state templates, optional holidays N of M, holiday on weekly off (S), optional holidays on transfer prorate / reset | M02 §A2, YX-AT-11, YX-LV-13 |
| 3.9 Leave year | Leave year per entity (d), company blackout dates | M02 L1, E19 |
| 3.10 Periods & locks | Attendance freeze day per entity, maximum lateness for late requests | P08 Q2, Q4 |
| 3.11 Projects & timesheets | Projects / tasks, activity and internal codes (S), billable default, approver resolver defaults, utilisation target (S), burn alerts (S); timesheet pre-fill on / off, work-tool connectors allowed (calendar / Jira / GitHub), mapping rules (PRJ-08) (P23) | M12 (B1), M02 §B7 (D4) |
| 3.12 Visitors | Visitor types, host approval, ID / photo capture, notice shown at check-in, badge template, watch-list access, visitor-data retention (S) | M02 §B11 (C1) |

### Group 4 · Payroll & Statutory

| Page | Settings on this page | Doc |
|---|---|---|
| 4.1 Pay groups & calendars | Frequency, pay calendar, cut-off | M03 §3, Q3 |
| 4.2 Components & templates | Component library and flags, salary templates, employer PF / ESI / gratuity inside CTC, entry mode | M03 §3, Q1 |
| 4.3 Payroll policies | Day basis (d), variance threshold, protected net (d), one-time pay types, salary-hold auto-triggers, cash / cheque allowed (S), maternity top-up (S), bonus payment method per entity, payslip-query assignee | M03 YX-PAY-02/06/11/28/31, E2, Q8, D13 |
| 4.4 Payslip layout | Layout per entity (§8 F-6); password-protected PDF option (prop. B19) | GAP G4, B19 |
| 4.5 Tax | Regime change cut-off (d), declaration window, proof window, reminders; tax regime comparison on / off and reminder days (P23) | M03 Q5, YX-TAX-01 |
| 4.6 Loans & advances | Loan types, limits (amount, EMIs, eligibility), interest, pre-closure / pause rules | M03 Q4 |
| 4.7 Statutory set-up | Registrations per entity × statute × state, legal options (d), filing mode per statute (self / partner), deductor and responsible-person details, compliance-calendar reminders | P07 Q1, M03 Q6, Q7, §4 |
| 4.8 Expenses & travel | Categories, policy matrix (category × grade × tier) (d), limits per line / day / trip / month, mileage, per diem, city tiers, receipt threshold, OCR, GST capture, over-limit route or hard block, payment route default, advance settlement window and recovery instalments, travel desk, corporate cards, taxable categories | M05 Q1–Q8, YX-EXP-10 |
| 4.9 Contract labour | Principal-employer registrations, contractor licence rules, vendor compliance checklist (S), monthly document cut-off, liability holds | M13, P07 `IN.CLRA` (B17) |
| 4.10 Earned wage access | EWA on / off per group, % of earned-to-date, draws per month, fee bearer, partner connection, recovery order (S) | M03 §6 item 10 (B10) |
| 4.11 Benefits & FBP | Insurance plans (GMC / GPA / GTL), dependant rules, enrolment windows, endorsement rules, FBP basket and limits, declaration / bill windows, year-end sweep, employer NPS; group insurance marketplace on / off and partner (P23, licensed partner only); **Perks**: on / off (starter off) and categories (P23) | M11 |

### Group 5 · Documents & Communication

| Page | Settings on this page | Doc |
|---|---|---|
| 5.1 Document types | Sensitivity, verification required, expiry, retention per type | P05 Q7, YX-DOC-04 |
| 5.2 Letters | Letter types, approval required per type, QR verification per type, instant self-service types, reference prefixes, letterheads, templates | P05 Q1, Q4, Q5, Q8 |
| 5.3 Signatories & e-sign | Authorised signatories, company DSC, Aadhaar eSign per letter type (add-on) | P05 Q2 |
| 5.4 Notifications | Channels, defaults per group (field staff), email sender, email / in-app wording, digests, quiet hours default | P04 Q1, Q5, Q7 |
| 5.5 WhatsApp & SMS | Company WhatsApp number connection, template library status, new-wording requests, DLT templates | P04 Q2, Q5 |
| 5.6 Announcements | Acknowledgement defaults, reminder cadence, mobile Home pinning | P04 Q8 |
| 5.7 Policies | Audiences, acknowledgement method (click / OTP), quiz, re-acknowledge on major version, reminders and escalation; policy writer (Write with AI) on / off, questionnaire answers (P23) | M08 Q6 |
| 5.8 Helpdesk | Queues, categories, SLA by priority, business hours, sensitive categories, macros, support email address, knowledge base | M08 Q1, Q2 |
| 5.9 Engage | Spaces and posting policy, interest groups, moderation mode, blocked words, report threshold, survey cadence and anonymity defaults, recognition mode (badges / points), point budgets and value, reward catalogue, celebrations per type, mirrors to Teams / Slack, leaderboard on / off | M09 Q1–Q8 |

### Group 6 · Hiring & Assessments

| Page | Settings on this page | Doc |
|---|---|---|
| 6.1 Hiring | Pipeline and scorecard templates, headcount-plan approvers and outside-plan approver, offer settings (expiry, clawback), hand-off mode per entity, BGV packages and timing, candidate retention months, AI interview on / off and languages, careers-site branding, referral-bonus rules, recruiting cost categories | M10 Q1–Q6, P09 Q3 |
| 6.2 Staffing desk | Rate-card defaults, invoice numbering per entity / GSTIN, ageing buckets and dunning (S), bench policy (S), client-portal SLAs | M10 Q7, Q8, E17 |
| 6.3 Performance | Goal types (OKR / KPI), review templates, rating scales, stage defaults, 360° anonymity, calibration guide (enforced distribution wave 6), comp-review matrix and budgets, PIP durations, competency library, 1:1 cadence; manager coach frequency (weekly / fortnightly / off) and signal types, review assistant on / off (P23) | M06 Q1–Q8 |
| 6.4 Learning | Assignment rules, self-enrol approval, decline allowed, budgets (warn / block), training bond threshold and terms, completion threshold, effectiveness check delay, trainer access expiry | M07 Q2–Q8 |
| 6.5 Assessments | Skill taxonomy, review workflow per collection, languages, library packs; test defaults (timers, navigation, retakes, exposure cap, high-stakes approval threshold); delivery defaults (window / slots, reschedules, reminders, no-show grace, offline minutes, time-credit cap, device policy, readiness block / warn); proctoring mode defaults and action matrix, live ratio, YukthiX-proctor opt-in, ID check, room scan; result release per test, appeal window, incident SLA, retention (30–365 days), consent texts per jurisdiction, ATS auto-advance per job | T01 Q2–Q7, T02 Q4–Q7, T03 Q1–Q7, T04 Q1–Q8, T05 Q1–Q8 |

### Group 7 · Integrations & Developers

| Page | Settings on this page | Doc |
|---|---|---|
| 7.1 Integrations | Connection catalogue, owners, health, run logs; link to **Jobs & errors** (PLT-38: deliveries, sync jobs, imports, notifications, automations, with retry) | P10 §7, YX-INT-01 / 10 |
| 7.2 Biometric devices | Devices, route (cloud / agent / CSV), enrolment-ID mapping | P10 Q4 |
| 7.3 Payouts, banks & accounting | Bank file formats, payout partner (add-on), Tally / Zoho / CSV ledger and cost-centre mapping, Accounting API | P10 Q5, Q7 |
| 7.4 Verification | PAN and penny-drop checks on / off per type | P10 Q6 |
| 7.5 Calendar & chat | Google / Microsoft calendar, Slack / Teams connections; per-user work-tool connectors for timesheets (Jira, GitHub, read-only) (P23) | P10 §B |
| 7.6 AI | Feature toggles, provider (managed / own key), AI review summaries, data handling per feature, credits used; **Assistants** on / off per P23 helper (payslip chat, policy writer, timesheet AI, manager coach, review assistant) (P23) | P10 Q1, Q2, Q8, YX-AI-03 |
| 7.7 Developers | API keys (scopes, field classes, IP allow-list, expiry), OAuth apps, webhooks, usage | P11 Q4, Q5 |
| 7.8 Analytics | Attrition series (include contractors / interns), calculated metrics, scheduled-delivery defaults | P09 Q1, Q5, Q7 |
| 7.9 Deepfake detection | On / off per interview type (AI interview, live interview), consent text per jurisdiction, action on a flag (review only; never auto-reject) | T04 YX-PROC-20, M10 YX-ATS-32 |

### Group 8 · Billing & Account

| Page | Settings on this page | Doc |
|---|---|---|
| 8.1 Plan & add-ons | Products, add-ons (payout API, verification, partner filing, BGV, eSign, e-invoice, travel booking, YukthiX proctors, question packs) | Spec D15 (prop. P14) |
| 8.2 Usage & caps | SMS quota, overage and spending cap or separate billing, AI credits, storage, API limits | P04 Q3, P11 Q8 |
| 8.3 Invoices & payment | Billing contacts, GST details, invoices, payment method | GAP A4 (prop.) |
| 8.4 Sandbox | Clone configuration, dry-run payroll, promote, sample data | P11 Q6, GAP A5 (prop.) |
| 8.5 Data export & closure | Whole-tenant export, closure with certified deletion | GAP A4 (prop.) |
| 8.6 Analytics, status & tips | Opt out of non-essential product analytics, status-page subscription (products, regions, recipients), mute set-up tips and trial nudges | P09 §4.10, P20 YX-GRO-03 / 09 |

**Count: 8 + 11 + 12 + 11 + 9 + 5 + 9 + 6 = 71 pages** (7.9 and 8.6 added 28 Sep 2026, validation pass 3; 62 + 1.7, 3.12, 4.9, 4.10, 4.11 added 26 Sep 2026; 3.11 renamed; 2.11 added by the P16 follow-up; 1.8 added by the P19 follow-up).

### Settings pages by owning doc (closes §8 F-13)

Instead of editing each doc's §7, this table is the reference: **owner** = the doc that decides the page's settings; **contributes** = docs that add settings to a page they don't own. Each doc's §7 "Settings" line points here.

| Doc | Owns pages | Contributes to |
|---|---|---|
| P01 Tenancy & organisation | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | — |
| P02 Access, visibility & privacy | 2.1, 2.2, 2.10 | 1.1 (data region), 2.3 (support access) |
| P03 Workflow & approvals | 2.4 | 2.1 (`workflow.policy.manage`) |
| P04 Notifications | 5.4, 5.5, 5.6 | 1.1 (language), 8.2 (SMS cap) |
| P05 Letters, documents & e-sign | 5.1, 5.2, 5.3 | 4.4 (payslip template kind) |
| P06 Effective-dated history | — | 2.6 (mid-period method, retro limit) |
| P07 Statutory rules | — (legal values are read-only, "set by law") | 4.7, 4.9 |
| P08 Period locks & audit | 3.10 | 2.10 (audit retention), 2.2 (who accessed) |
| P09 Metrics & analytics | 7.8 | 2.1 (`analytics.dashboard.build`), 2.2 (suppression) |
| P10 AI & integration hub | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 | 3.2 (face check-in) |
| P11 API-first | 7.7 | 1.1 (white-label), 8.2 (API limits), 8.4 (developer sandbox) |
| P12 Identity & security | 2.3 | — |
| P14 Billing & tenant lifecycle | 8.1, 8.2, 8.3, 8.5 | — |
| P15 Migration & sandbox | 8.4 | 1.6 (go-live checklist) |
| P16 Partner & accountant console | 2.11 | 8.3 (billing mode for partner-billed clients) |
| P17 Global search | — | 2.2 (content-search types, synonyms) |
| P18 Custom objects & builders | 1.7 | 1.5 (core custom fields link to 1.7) |
| P19 Policy rule builder | 1.8 | every module page with policies (Policies tab, PLT-31), 1.7 (layout conditions), 2.4 (routing conditions), 8.2 (rule and automation limits) |
| P20 Growth, trial & customer operations | 8.6 | — |
| P22 Workflow Studio & AI assistant | — | 1.8 (Workflow Studio settings, approved endpoints, service identities, inbound email and webhooks, tenant-wide kill switch), 8.2 (workflow limits) |
| P23 Employee & manager assistants and marketplaces | — | 3.11 (timesheet pre-fill, mapping rules), 4.5 (tax regime comparison), 4.11 (group insurance, perks), 5.7 (policy writer), 6.3 (coach frequency, review assistant), 7.5 (Jira / GitHub connectors), 7.6 (assistant switches) |
| M01 Core HR & lifecycle | 2.5, 2.6, 2.7, 2.8 | 1.5 (employee records) |
| M02 Leave & attendance | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.12 | 1.3 (geofence), 3.11 (timesheet rules) |
| M03 Payroll & statutory | 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.10 | — |
| M04 Mobile | — | 2.3 (mobile session, re-auth), 3.2 (device binding, kiosk) |
| M05 Expenses & travel | 4.8 | — |
| M06 Performance | 6.3 | 1.4 (grade pay ranges) |
| M07 Learning | 6.4 | — |
| M08 Helpdesk, cases & policies | 2.9, 5.7, 5.8 | — |
| M09 Engage | 5.9 | 2.1 (announcer permission) |
| M10 ATS & staffing | 6.1, 6.2 | — |
| M11 Benefits & FBP | 4.11 | 4.2 (FBP / NPS components) |
| M12 Projects & timesheets | 3.11 | — |
| M13 Contract labour | 4.9 | — |
| T01–T08 Proctoring | 6.5, 7.9 | — |
| APX-E Setup hub | — (reads every page) | 1.6 |

---

## 4. T9 · External-portal shell (new template)

**Purpose.** One shell for people outside the workforce and for public pages: branded, single-purpose, narrow.

| Element | Rule |
|---|---|
| Header | Tenant logo and name, brand colour (`--org-primary`), portal title ("Your joining checklist"). No YukthiX or third-party branding when white-label is on (principle 10, U78). |
| Navigation | **Single purpose**: at most one short tab row. No sidebar, **no entity or period switcher**, no global search, no notification bell (messages come by email / SMS / WhatsApp link). |
| Session | **OTP session** to the person's email or mobile (P02 §4.7, YX-SEC-21): scoped to named records, not a billed seat, auto-expiry shown as a banner ("Access ends 15 Oct"), idle timeout, audited. Variants: **public** (no login: careers, verify), **access code** (anonymous reporter: code shown once, no identity stored, YX-CASE-11), **runner** (full-screen test with status bar). |
| Content | Mobile-first, one column, primary button pinned at the bottom (T8 pattern); only data the grant allows; never Confidential values of other people. |
| Language | Language switcher: English, Hindi, Tamil, Telugu (P04 Q4). |
| Accessibility | WCAG 2.1 AA (YX-DLV-11 applies to every T9 page). |
| Security | Bot protection on public pages (GAP A1); rate-limited OTP (M04 Q2); no search-engine indexing except careers. |
| **Footer** | Links to the tenant's **privacy notice** (per portal type), **terms of use**, **accessibility statement** and **cookie notice** (public pages; necessary cookies only unless consent) (GAP H6). |

| Portal | Access | Sees | Ends | Doc |
|---|---|---|---|---|
| Pre-boarding candidate | OTP | Own checklist, forms, documents, e-sign, bank, regime, LOI / offer | Joining date or unwind | M01 §3.5 |
| Alumni + nominee | OTP (personal email / mobile) | Alumni: own payslips, Form 16, letters. Nominee: deceased's F&F statement, Form 16, claim documents | 7 years (alumni); per YX-DOC-19 (nominee) | P05 Q6, M01 E1 |
| External trainer | Email OTP | Own sessions: attendees, attendance, results, feedback summary | N days after last session | M07 Q6 |
| POSH IC external member (+ external party, E16) | OTP | Cases appointed to (restricted area); external complainant: own case | Tenure end / case close | M08 Q4, E16 |
| Audit-committee chair | OTP | Whistleblower outcomes routed to the committee | Tenure end | M08 Q8 |
| Client contact | Email OTP | Own client's jobs, submissions, interviews, timesheets, invoices, tickets | Contract end | M10 Q8 |
| Candidate test portal | Magic link / OTP (employees: own session, YX-DLV-13) | Own tests, booking, readiness, practice, consent, runner, results, privacy centre | Retention period | T03–T05 |
| Anonymous reporter case page | Case access code | Case status and two-way messages | Case closure | M08 E20 |
| Public verify page | Public | Company, letter type, name, issue date, current / superseded | — | P05 Q5 |
| Careers site | Public | Public job fields, apply | — | M10 YX-ATS-02 |
| Campus registration (+ college coordinator) | Public form + OTP; coordinator OTP | Own registration, admit card; coordinator: own college's registrants and results | Drive close / coordinator term | T03 §11 B7 |
| Staffing vendor | Email OTP | Own vendor's shared jobs, submissions, invoices | Agreement end | M10 §11 C7 |
| Contract-labour vendor | Email OTP | Own contractor's workers, challans, registers, licences | Contract end | M13 |
| Visitor invite | Single-visit link | Own visit details, pass | Visit end | M02 §B11 |

**Footer pages: artefacts and owners (closes §8 F-16).** The four footer links on every T9 page resolve to [APX-G](APX-G-legal-artefacts.md) artefacts; the portal type picks the variant.

| Footer link | APX-G artefact by portal | YukthiX owner (template) | Published by |
|---|---|---|---|
| **Privacy notice** | Pre-boarding → G-09 (pre-boarding) + G-06; alumni / nominee, trainer, IC external, audit-committee chair, client, staffing vendor, contract-labour vendor → G-09 variant; candidate portal, careers, campus, candidate app → G-07; anonymous reporter → G-10; visitor invite / kiosk → G-27; developer portal and YukthiX-hosted pages → G-05; public verify page → G-05 | DPO | Tenant role with `privacy.notice.publish` (HR Admin + System Admin) for tenant versions; YukthiX platform staff (two-person) for G-05 |
| **Terms of use** | Signed-in portals → G-16 acceptable-use policy (tenant's contract terms are G-01, never shown to external users); candidate portal and candidate app → G-29; developer portal → G-16 + API terms in G-01 | Founder / trust & safety (G-16), commercial lead (G-29 with DPO) | YukthiX platform staff |
| **Accessibility statement** | G-17 per product | Design lead | YukthiX platform staff |
| **Cookie notice** | Public pages (careers, verify, campus registration, visitor invite, developer portal) → G-14; signed-in portals use necessary cookies only and link G-14 | DPO + web lead | YukthiX platform staff (tenant adds analytics tools only through the consent banner) |
| Also in every footer | G-23 grievance officer / DPO contact · G-21 open-source notices | DPO · engineering lead | YukthiX platform staff |

---

## 5. Mobile tab map (canonical)

**This table is the canonical mobile map** (M04 §3 points here). Every employee- and manager-facing flow has one home tab; Home may show a to-do card that deep-links into it. Wave = the owning module's wave (YX-MOB-01). Rows marked **F5** were missing from the earlier tab lists.

| Tab | Flow | Owning doc | Wave |
|---|---|---|---|
| **Home** | Today card: shift, check-in state, pending actions | M04, M02 | 2 |
| Home | To-dos (approvals due, self-review, proofs, tasks, policy acknowledgements due) | P03, P04 | 2→ |
| Home | Announcements with acknowledgement | P04 Q8 | 2 |
| Home | Celebrations strip, feed, open surveys, Give kudos | M09 | 5 |
| Home | **Team** segment (managers): team today, exceptions + nudge, team calendar, team member profile | M04 Q5 | 2 |
| Home | **Search** (header): records and actions, recent items (P17) | P17 | 2 |
| **Time** | Check-in / out sheet (geofence verdict) | M04, M02 | 2 |
| Time | Attendance calendar: **late / early / missing markers**, **day-grouped punches** under the day card, Fix (U23) | M02, §8 F-4 | 2 |
| Time | Regularise, WFH, on-duty, OT request | M02 §B4 | 2 |
| Time | Leave balances (balance card; unpaid types show **"taken"**, U7), apply leave, withdraw | M02 §A2, §8 F-1 | 2 |
| Time | **Comp-off claim** (F5) | M02 §A2 | 2 |
| Time | **Optional holidays** (choose N of M) (F5) | M02 §A2 | 2 |
| Time | My shifts / roster; **shift swap request and colleague consent** (F5) | M02 §B2 | 2 |
| Time | **Timesheets** (day list, submit week) (F5) | M02 §B7 | 2 (placements 7) |
| Time | **Maternity / long-leave status** (absence type, expected return, pay effect) (F5) | M01 E3, M02 E2 | 4 |
| Time | **Field visits**: visit check-in, beat plan, tracking banner, conveyance (B2) | M02 §B8 | 5 |
| Time | **Open shifts** (claim) and **shift bids** (B3) | M02 §B9 | 6 |
| **Requests** | Request sheet (all P03 types: leave, attendance, expense, trip, loan / advance, profile change, letter, resignation, training, helpdesk) | M04 §3 | 2→ |
| Requests | Mine: status incl. requests raised on my behalf | P03 D5 | 2 |
| Requests | Team: approvals inbox (cards, swipe, bulk low-risk) | P03, YX-MOB-02/03 | 2 |
| Requests | **Probation review form** (manager) (F5) | M01 §3.4 | 4 |
| Requests | **Custom request types** in the type picker; custom-object records where the layout is mobile-enabled (B20) | P18 | 6 |
| Requests | Timesheet approvals for project managers | M12 | 5 |
| **Pay** | Payslips (net first, why-this-number), YTD; **raise a payslip query** (F5) | M03 §7, D13 | 3 |
| Pay | Tax workspace (regime, declarations, proofs), Form 16 | M03 §7 | 3 |
| Pay | Loans and salary advances | M03 Q4 | 3 |
| Pay | Expenses (camera-first claims), trips, advances | M05 | 5 |
| Pay | **Earned wage access** (available amount, fee, request, recoveries) (B10) | M03 | 5 |
| **Me** | Profile and change requests | M01, P02 | 2 |
| Me | Documents, letters, certificates | P05 | 2 (letters 4) |
| Me | **Policies and acknowledgement** (F5) | M08 Q6 | 5 |
| Me | Goals, check-ins, quick feedback, 1:1s, review acknowledgement; **PIP acknowledgement** (F5) | M06 | 5 |
| Me | Learning, **My tests** (F5), skills | M07, T03 D2 | 5 |
| Me | Help centre and my tickets | M08 | 5 |
| Me | **Speak-up: grievance / POSH / whistleblower filing**, my cases, show-cause reply (F5) | M08 | 4 (POSH), 5 |
| Me | **Referrals** and **internal jobs** (F5) | M10 | 7 |
| Me | Rewards | M09 Q4 | 5 |
| Me | **My visitors** (pre-register, arrival alert) (C1) | M02 §B11 | 6 |
| Me | **Attendance presence consent** (desktop agent / Teams presence, withdraw) (C1) | M02 §B10 | 6 |
| Me | **My exit** (while serving notice): resignation status, **exit clearance, exit interview, asset return** (F5) | M01 §3.7 | 4 |
| Me | **Delegation** (F5) | P03 Q3 | 2 |
| Me | **Privacy: My data, Who accessed my data** (F5) | P02 §7, P08 Q6 | 2 |
| Me | Settings & security (language, notifications, devices, sign out), help and tours | M04 Q8, P04, §6 | 2 |

---

## 6. Help & onboarding UX patterns (GAP H7)

### 6.1 Role-based first-run tours
- **Tours:** employee first login (mobile: check-in, balances, requests, payslip, language), **manager first approval** (card anatomy, send back, bulk, delegation), **payroll admin first run** (readiness, variance, approval and lock, bank file, publish), HR / System Admin first login (Set-up hub).
- **Rules:** at most 5 steps; skippable; never blocks work; resumable from Help; shown once per user per tour version; triggered by the event (first item in the approvals inbox, first run created), not by date; available in the user's language; completion recorded for adoption reporting.

### 6.2 Contextual help content model
- **One help topic per screen** keyed by the §2 screen ID: summary (≤ 2 sentences), "how it works" steps, field help (tooltip per field), glossary terms (e.g. "Unpaid leave" with LWP), links to the governing Settings page (with source scope) and to the relevant rule in plain words, related knowledge-base article (M08), optional short video.
- **Languages:** employee-facing screens (T8, T4 employee sheets, T9) in English, Hindi, Tamil, Telugu (P04 Q4); admin screens English first. From the translation catalogue (YX-MOB-10).
- **Ownership:** YukthiX product content, versioned with releases, our own wording (clean-room). A company may append a short "company note" to a topic; notes are content, not policy.
- **Surfaces:** help drawer in the T3 right rail / T1 "?" button; bottom sheet on mobile; the AI helpdesk (P10 Q8) answers from the same content plus company policies.

### 6.3 Permission denied vs not found, and "Request access"
- A record that exists and whose **existence** the viewer may know, but not open → **"You don't have access to this {record type}"** with the owner role and a **Request access** button. It raises a P03 request (type "access request", §8 F-11) to the role owner, then System Admin; the grant, if approved, is time-boxed where the role allows.
- A record that does not exist, **or** sits in a restricted area (POSH, disciplinary, grievance, whistleblower, medical; YX-SEC-10) → **"Not found"**, identical to a missing record; never "Request access".
- A module or item the plan doesn't include → "not enabled" state (§6.5), not an error.
- The API mirrors the UI: 403 with a problem `code` for denied, 404 for not found and restricted (YX-API-07). Navigation hides what a person can't reach (principle 7); links from notifications re-check permission (YX-NTF-03).

### 6.4 Irreversible-action dialog
- **Impact preview:** what will happen, to how many people / records, totals (e.g. "412 payslips · ₹1,82,40,500 net"), what can't be undone and the correction path afterwards ("changes after this go to next month as arrears").
- **Typed confirmation** of a short phrase (entity + period, e.g. "WORKFOX SEP 2026"), a reason where a rule requires one, and the maker ≠ checker status shown (YX-SEC-12).
- **Applies to:** publish payslips (PAY-09), release bank file (PAY-08), approve run / lock period (PAY-07, TIM-11), reopen period (YX-LOCK-05), year-end posting (TIM-29), statutory file generation and return filing, Form 16 publish, bulk changes and bulk transfers (PPL-06, PPL-09), entity close, bulk letter issue. **Bulk approve** uses a lighter count confirmation ("Approve 14 leave requests") and is offered only for low-risk types (YX-MOB-03).
- The confirmation phrase and preview totals are stored with the audit event (§8 F-15).

### 6.5 Availability states
- **"Available in wave X"** (pilot and build period): the item shows a short description and expected wave; no dead pages.
- **"Not enabled for your company"**: product or add-on not in the plan. Admins see it with "Enable in Billing & Account"; employees don't see the item at all.
- **"Set-up needed"**: feature on but incomplete; links to the Set-up hub card (PLT-08).

### 6.6 Empty states
- Distinct from zero (brief §5): **first use** (what this screen is for + primary action), **filtered to nothing** (clear filters), **not due / not covered / pending** (named states, U44).
- **Sample data:** in a **sandbox tenant only** (P11 Q6, GAP A5), first-use empty states offer a "Load sample data" toggle; sample records are labelled and removed in one action. Never offered in a production tenant.

---

## 7. U-issue closure matrix

Status: **Rule** = fixed by the cited YX rule · **UI** = fixed by a UI pattern (brief section, doc §7 or this appendix) · **Won't do** with reason. "F-n" = rule follow-up in §8.

| U | Issue (short) | Status | Fix | Doc |
|---|---|---|---|---|
| U1 | Hidden default company → dashboards 0 | Rule | YX-ORG-13, YX-MET-05 | P01, P09 |
| U2 | Two different balances | Rule | YX-LV-01 | M02 |
| U3 | Approve = edit status + Submit | Rule | YX-MOB-02, YX-WF-08; approval card | P03, M04 |
| U4 | Duplicated banner; fields below the fold | UI | T3 record workspace, right rail (brief §3, principle 7) | Brief |
| U5 | "Submitted" everywhere; IDs not names | UI | Status map + "says what happens next" (brief §6.1, §6.3); Person chip | Brief |
| U6 | Reports open empty with red filters | UI | T7 defaults always set; default scope YX-ORG-13 | Brief, P01 |
| U7 | Unpaid leave as negative balance | UI | Balance card shows "taken" for unpaid types (§5) — **F-1** | M02 |
| U8 | Weekly offs as 52 rows | Rule | YX-AT-02 | M02 |
| U9 | ~30 flat leave-type settings | UI | Sectioned editor with live example (TIM-27) | M02 §A2 |
| U10 | 25-item sidebar | UI | ≤ 8 items per module, role-based (§1) | Brief, APX-D |
| U11 | "7.5/7.5"; "ID : name" | UI | Balance card "X of Y left · +n on date"; Person chip | Brief §5 |
| U12 | System noise in activity | Rule | YX-AUD-05 | P08 |
| U13 | Missing punch shown as threshold | Rule | YX-AT-03 | M02 |
| U14 | Any minutes = OT | Rule | YX-AT-04 | M02 |
| U15 | Report counts differ from module | Rule | YX-MET-01 | P09 |
| U16 | Desk calendar empty for HR | UI | Time › Today, muster, team calendar in viewer's scope (TIM-01, -02, -20) — **F-2** | M02 |
| U17 | GPS stored, never shown | UI | Day card punch map + distance + verdict (TIM-03) — **F-3** | M02 |
| U18 | One schedule → 9 records | UI | Roster-first; patterns as dated facts, generated records hidden (TIM-05/06) | M02 §B2 |
| U19 | "WO" plus shift card | Rule | YX-AT-02 | M02 |
| U20 | Late as plain P; blank days | Rule | YX-AT-03 ("Off" vs "Missing"), YX-AT-05; muster cell markers | M02 |
| U21 | Automatic change doesn't link back | Rule | YX-WF-12, YX-LV-01 (ledger entry with link) | P03, M02 |
| U22 | Sync plumbing shown as settings | Rule | YX-INT-01 (health and logs, not config) | P10 |
| U23 | Mobile: late green, raw log, pick approver | UI | Time tab markers, day-grouped punches (§5); approver derived YX-WF-03 — **F-4** | M04 |
| U24 | Shift-location form didn't render | Won't do | Test-instance fault, not a product defect (UI ref 02) | — |
| U25 | Generic run failure banner | Rule | YX-API-07 (error names record and field), YX-PAY-05; per-item result — F-5 | M03, P11 |
| U26 | No review grid before submit | Rule | YX-PAY-06 (variance acknowledged before approval); PAY-03 Payslips / Variance tabs | M03 |
| U27 | Background submit looked done | UI | Per-employee progress and result (PAY-03, brief T5) — **F-5** | M03 |
| U28 | Set-up errors found one at a time | Rule | YX-PAY-05 pre-run validation, YX-PAY-01 template validation; set-up wizard (PAY-16) | M03 |
| U29 | Payslip spread over 5 tabs | UI | One page, net first (Money summary, PAY-21) | Brief §5, M03 §7 |
| U30 | LWP counts without dates | Rule | YX-PAY-12 (explained lines) | M03 |
| U31 | YTD ignores opening balances | Rule | YX-PAY-10; opening YTD in set-up (M03 §6) | M03 |
| U32 | Wrong tax labels | Rule | YX-TAX-06; plain labels (brief §6.1) | M03 |
| U33 | Poor print format | UI | Payslip layout editor (PAY-15) — **F-6** | M03, P05 |
| U34 | "Last month" ₹0 after a run | Rule | YX-MET-05 (scope, freshness, run status) | P09 |
| U35 | Per-company tax slab copies | Rule | YX-STAT-01, YX-STAT-06 | P07 |
| U36 | CTC equals gross | Rule | YX-PAY-17 (employer contributions in CTC) | M03 |
| U37 | Register columns off-screen | UI | T7 pinned name / net, grouped columns | Brief §3 |
| U38 | Report ignores period filter | UI | T7 defaults to current FY and entity | Brief §3 |
| U39 | Statutory data scattered | Rule | YX-STAT-06 (options per legal entity); one set-up page (CMP-02, §3 4.7) | P07, M03 |
| U40 | Missing deductor fields at validation | UI | Completeness check when a statute is switched on (CMP-02) — **F-9** | M03 |
| U41 | Statutory IDs hidden; IBAN not IFSC | Rule | YX-EMP-01 | M01 |
| U42 | Missing PAN never warned | Rule | YX-PAY-05, YX-TAX-10; missing-ID dashboard (CMP-07) | M03 |
| U43 | Empty / duplicate statutory reports | Rule | YX-PAY-20, YX-MET-01 | M03, P09 |
| U44 | ₹0 rows unlabelled; pills truncated | UI | "Not covered / not due" states; tested pill sizes (brief §5) | Brief |
| U45 | Challan typed by hand, no interest | UI | Challan sheet pre-filled with interest / fee (CMP-04) — **F-7** | M03, P07 |
| U46 | Opening months missing from 24Q | UI | Prior-month deductee rows in the return wizard (CMP-05) — **F-8** | M03 |
| U47 | Address retyped; ₹0.29 difference unflagged | UI | Deductor details from set-up; reconciliation step (CMP-05) — **F-9** | M03 |
| U48 | Form 16 accepts Q2; zero Part B | Rule | YX-TAX-07, YX-TAX-08; "available after year end" state | M03 |
| U49 | Pre-joining tasks impossible | Rule | YX-LC-02 | M01 |
| U50 | Task progress in another module | Rule | YX-LC-02 (progress on the record) | M01 |
| U51 | New hire has no role | Rule | YX-LC-03; pre-boarding portal (T9-01) | M01 |
| U52 | Promotion without pay | Rule | YX-EMP-05 | M01, P06 |
| U53 | Lifecycle scattered in navigation | UI | People module holds the whole journey (§1) | APX-D |
| U54 | Transfer without effects | Rule | YX-EMP-05, YX-HIS-11 | M01, P06 |
| U55 | No notice calculation; plain "Active" | Rule | YX-LC-04; "Serving notice" badge | M01 |
| U56 | Leaver's name next to manager ID | UI | Person chip, correct linked names | M01, Brief §5 |
| U57 | F&F all ₹0 | Rule | YX-LC-06 | M01 |
| U58 | Promotions 0 vs chart | Rule | YX-MET-01 | M01, P09 |
| U59 | Wrong defaults found on failure | UI | Pre-flight set-up check (M05 §7), Set-up hub | M05 |
| U60 | No receipt per line | Rule | YX-EXP-03 (line = receipt) | M05 |
| U61 | No limits; reductions without reason | Rule | YX-EXP-02 | M05 |
| U62 | Approval by dropdown; paid merged | Rule | YX-EXP-07 | M05 |
| U63 | Net payable buried | Rule | YX-EXP-06 | M05 |
| U64 | Travel not linked | Rule | YX-EXP-08 | M05 |
| U65 | Advance missing from F&F | Rule | YX-LC-07, YX-EXP-09 | M01, M05 |
| U66 | Unpaid report not net | Rule | YX-EXP-06 | M05 |
| U67 | Dashboards don't count the approval queue | Rule | YX-WF-14 (counts from the task query) | P03 |
| U68 | Partial cut shown as "Rejected" | Rule | YX-EXP-02 ("approved ₹X of ₹Y — reason") | M05 |
| U69 | Missing inputs scored as 0 | Rule | YX-PERF-02 | M06 |
| U70 | No cross-person cascade | Rule | YX-PERF-01 | M06 |
| U71 | Typed % progress | Rule | YX-PERF-01 | M06 |
| U72 | No manager stage / calibration | Rule | YX-PERF-03, YX-PERF-08 | M06 |
| U73 | 4.083 without band or owner | Rule | YX-PERF-06, YX-PERF-07 | M06 |
| U74 | Stats not clickable | Rule | YX-PERF-12 | M06 |
| U75 | Feedback desk-only, wrong avatar | Rule | YX-PERF-04; quick feedback on mobile (PRF-08) | M06 |
| U76 | Promotion under Performance | UI | Lifecycle vs performance navigation split (M06 §7, §1) | M06 |
| U77 | Non-ASCII slug | Rule | YX-ATS-02 | M10 |
| U78 | Internal codes on careers page | Rule | YX-ATS-02; T9 branding (§4) | M10 |
| U79 | Requisition approval by dropdown | Rule | YX-ATS-01 | M10 |
| U80 | Email as record ID | UI | Opaque IDs, human names (M10 §2) | M10 |
| U81 | Name-only kanban cards | UI | Rich pipeline cards (HIR-04) | M10 |
| U82 | No meeting link / pass bar | Rule | YX-ATS-04 | M10 |
| U83 | CTC as free text | Rule | YX-ATS-06 | M10 |
| U84 | Systemic wrong linked name | UI | Person chip everywhere (M08 §7) | M08, M01 |
| U85 | No confidentiality / SLA / POSH | Rule | YX-CASE-02, YX-POSH-05, YX-HD-01 | M08 |
| U86 | Training split in three documents | Rule | YX-LRN-08, YX-LRN-02 | M07 |
| U87 | Skills not updated by training | Rule | YX-LRN-03 | M07 |
| U88 | Stand-ups need incoming email | Won't do | Daily stand-ups dropped in Phase 2 (P2-3); goal check-ins and 1:1s (M06) cover the team-update need | — |
| U89 | Flat approver list | Rule | YX-WF-01, YX-WF-03 | P03 |
| U90 | 35 switches in one settings page | Rule | YX-ORG-12, YX-ORG-18 (registry, scopes); Settings map + search (§3) | P01, APX-D |
| U91 | Full form for mobile approval | Rule | YX-MOB-02 | M04 |
| U92 | Drafts in team requests | Rule | YX-MOB-03 | M04 |
| U93 | One notification per document, raw ID | Rule | YX-MOB-04, YX-NTF-09 | M04, P04 |
| U94 | Check-in without context | Rule | YX-MOB-05 | M04 |
| U95 | No mobile for many modules | Rule | YX-MOB-01; canonical tab map (§5) | M04 |
| U96 | Hidden dynamic company filter | Rule | YX-ORG-13, YX-MET-05 | P01, P09 |
| U97 | Posting-date window, ₹0 after run | Rule | YX-MET-05 (pay-period metrics, run status) | P09 |
| U98 | Ungoverned recruitment metrics | Rule | YX-MET-01, YX-MET-02 | P09 |
| U99 | No attrition / retention metrics | Rule | YX-MET-06 (snapshots), P09 Q1 attrition | P09 |
| U100 | Two exit definitions | Rule | YX-MET-01 (one definition), P09 Q1 | P09 |
| U101 | Unlabelled pies, counts without rates | UI | Metric widget: labelled bars, rates beside counts (brief §5) | P09, Brief |
| U102 | Widgets built from field names | UI | Widget wizard metric → dimension (ANL-03) | P09 §7 |
| U103 | Flat report list | UI | Report library grouped by question, search (ANL-06) | P09, 11-analytics |

**Totals:** Rule **70** · UI **31** · Won't do **2** · = **103**.

---

## 8. Follow-ups for owning docs

> ✅ **26 Sep 2026:** F-1–F-9, F-11, F-12 (APX-E), F-15 applied in the owning docs (YX-LV-14, YX-AT-14/15, YX-MOB-12, YX-PAY-34/35/36, YX-TAX-14/15, YX-STAT-14, YX-WF-19, YX-AUD-09). Still open: F-10 ("fixes Uxx" citations in every §9 — traceability is kept in §7 above), F-14 (waits on P12/P14/P15). **Closed 26 Sep 2026 in this appendix:** F-13 by the "Settings pages by owning doc" table (§3), F-16 by the footer-owner table (§4, APX-G G-05–G-29).

These are rules or small additions this appendix relies on. **The owning docs are not edited here**; each item is for the doc's owner to accept, change or reject.

| # | Owner | For | Proposed addition |
|---|---|---|---|
| F-1 | M02 | U7 | Rule: unpaid (LWP) leave types carry no balance; the balance card, reports and mobile show "taken this year", never a negative closing balance (negative balances only for paid types within their L6 limit). |
| F-2 | M02 | U16 | Rule: Today board, muster, team calendar and attendance calendar open in the viewer's widest P02 scope (manager: team; HR: entity), never self-only; the personal view is the employee's mobile Time tab. |
| F-3 | M02 | U17 | Rule: the day card shows each punch's source, map pin, distance to the nearest allowed location and verdict (inside / outside / field-recorded) to viewers in scope. |
| F-4 | M04 | U23 | Rule: the Time tab calendar marks late / early / missing / OT with the brief §6.3 colours (late = warning, never success); punch history is grouped by day under its day card; no request sheet asks for an approver. |
| F-5 | M03 | U27, U25 | Rule: calculation, submission, publication and file generation show per-employee progress and result inline; a run changes status only when every payslip succeeded; failures name the employee, record and field with a Fix link. |
| F-6 | M03 + P05 | U33, G4 | Rule + template: a payslip layout per legal entity (sections, component order and grouping, employer-contribution box, YTD, days strip, languages, logo, no empty columns, one totals block), edited on Settings 4.4 with a sample-employee preview; P05 adds "payslip" as a template kind in the single render pipeline (YX-DOC-15). |
| F-7 | M03 + P07 | U45 | Rule: a TDS challan is pre-filled from the approved runs for its deposit month; interest for late deduction / deposit and the late-filing fee are computed from new P07 IN.TDS interest and fee parameters; a manual edit needs a reason. |
| F-8 | M03 | U46 | Rule: a quarterly return for an entity that started or migrated mid-year includes prior-month deductee rows from the imported YTD; missing months block validation with a Fix link. |
| F-9 | M03 | U47, U40 | Rule: deductor and responsible-person details come from the entity's statutory set-up, validated when the statute is switched on; the return shows challan vs deduction reconciliation and flags any difference before FVU validation. |
| F-10 | All docs §9 | F6 | Add "fixes Uxx" citations per the §7 matrix to each owner's acceptance tests (notably U3–U6, U9–U11, U15–U18, U20–U23, U26–U29, U31–U34, U36–U47, U50, U51, U53, U55, U67, U80, U89, U98–U103). |
| F-11 | P03 | §6.3 | Register an **access request** request type (subject = resource / permission; routed to the role owner, then System Admin; never for restricted areas; time-boxed grants). |
| F-12 | P01 | G1, PLT-08 | Set-up hub with one completeness card per module; the "Set-up needed" state (§6.5) reads it. |
| F-13 | M01–M10, P05 §7 | G2–G5 | Each doc names the Settings pages and editors §3 assigns to it. |
| F-14 | P12, P14, P15 (proposed) | A1, A4, A5 | Pages 2.3 (security part), 8.1–8.5 and PLT-19 are placeholders until those docs are decided. |
| F-15 | P08 | §6.4 | Store the typed confirmation phrase and impact-preview totals in the audit event of each irreversible action. |
| F-16 | P02 §6 / P14 | H6, §4 | Owners and content for the T9 footer pages (per-portal privacy notices, terms, accessibility statement, cookie notice). |
