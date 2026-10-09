# 99 · YukthiX HR — UI Summary & Design-System Brief

> **Superseded in part (28 Sep 2026):** visual tokens (fonts, colours, spacing, radius, motion) and component rules now live in `brand/DESIGN-SYSTEM.md` v1.0 (spec D28). Typography changed to IBM Plex Sans; where this brief differs, the design system wins.
>
> **What this is.** One page the team designs and builds from. It brings together the eleven UI references (01–10 plus 11 Analytics), about 215 screenshots and 103 recorded UI issues (U1–U103), and turns them into:
> - design principles;
> - page templates;
> - a component list;
> - content rules;
> - navigation;
> - the target screen inventory;
> - a build order.
>
> **Decision it implements:** D13. Frappe's layouts and flows are the blueprint, built in React in YukthiX's own design system, **the same one used by Proctoring and ATS** (the exam app).
> **Clean-room reminder:** reuse layouts and flows only. No Frappe code, CSS, icons, logos or copied wording. Screenshots are internal reference and are never shipped.
> **Date:** 24 Sep 2026.

---

## 1. Foundation — reuse the exam app's design system (don't start a new one)

The exam app (`apps/web`) already has a modern design system, "v2 / Azure". HR screens use it unchanged and add HR-specific components on top (§5).

| Layer | What exists today (exam app) | Use for HR |
|---|---|---|
| Stack | Next.js 16, React 18, Tailwind 3, Radix UI primitives, TanStack Query + Table, Recharts, Lucide icons, Framer Motion | Same. No new UI library. |
| Fonts | **Bricolage Grotesque** (display: titles, big numbers), **Hanken Grotesk** (body), self-hosted | Same. Big numbers (net pay, balances, clocks) use the display font. |
| Colour tokens (`.v2` scope) | `--paper #fff`, `--surface #f3f5f7`, `--ink #0b1220`, `--muted #64748b`, `--hair #e2e8f0`, `--accent #3b5fe3` (Azure), `--danger`, `--success`, `--org-primary` (tenant brand) + shadcn HSL set; **dark mode** already defined | Same. Tenant branding through `--org-primary`. |
| Status palette | `status.success / warning / danger / neutral / info / purple` with `-bg` pairs | Map HR statuses to these (§6.3). One meaning per colour. |
| Radius / spacing | `--radius 0.5rem`, page padding `clamp(18px,3vw,40px)`, content max 1440 px | Same. |
| Components (`components/ui-v2`) | AppShell, Sidebar, TopBar, Panel, Card, StatCard, IconStatCard, StatsHero, Gauge, **DataTable**, Tabs, Dialog, Dropdown, Combobox, TextField, PasswordField, FormAlert, **Timeline**, **ApprovalTimeline**, **ApprovalDecisionDialog**, NotificationBell, segmented control | Reuse directly. §5 marks which HR components extend them. |
| Older components (`components/ui`) | StatusBadge, EmptyState, Pagination, ColumnChooser, FilterableHeader, NumberFilterHeader, Skeleton, Toast, CollapsibleSection | Reuse where v2 has no equivalent; migrate to v2 over time. |

**One naming note:** the exam app still says "Workfox" (WorkfoxMark). Per D12 the product is **YukthiX**, and the rename happens during the platform work.

---

## 2. Thirteen design principles (ten backed by the issues we saw, one from the market analysis, two from validation pass 3)

| # | Principle | What it means on screen | Issues it prevents |
|---|---|---|---|
| 1 | **Decisions are actions, not field edits** | Approve / Reject / Send back buttons with a comment; never "change Status, then Submit". Review before deciding. | U3, U26, U62, U72, U79, U89, U91, U92 |
| 2 | **One number, everywhere** | Every figure comes from one calculation and matches across list, record, report, dashboard and mobile. Every aggregate shows its **scope** (entity · period). | U1, U2, U15, U31, U34, U36, U43, U58, U67, U71, U96, U97, U98, U100 |
| 3 | **Explain the why** | Amounts and statuses carry their reason in plain words: "5 unpaid days: absent 10 Sep (missed check-out), LWP 17–18 Sep"; "7.5 days × ₹1,538 (Basic ÷ 26)". Lead with the answer ("you will receive ₹5,790"). | U7, U13, U30, U32, U44, U57, U63, U66, U73, U101 |
| 4 | **Fail early, name the fix** | Pre-flight checklists before runs and filings; set-up completeness when a feature is switched on; errors name the exact record and field with a "Fix" link; background jobs show progress per item. | U6, U24, U25, U27, U28, U38, U40, U42, U59 |
| 5 | **Connected flows, no retyping** | A trip holds its advance and claim; an accepted offer creates pre-boarding and compensation; a promotion includes the pay revision; open advances reach F&F; training updates skills. Every automatic change links back to its cause. | U18, U21, U45, U46, U47, U50, U52, U54, U64, U65, U83, U87 |
| 6 | **Names, not IDs; hide the plumbing** | People, departments and documents are shown by name. IDs are secondary text. Engine state (sync times, generated records, company-suffix codes) is never shown as configuration. | U5, U11, U17, U22, U41, U56, U77, U80, U84, U93 |
| 7 | **Fields first, context in the side** | The main area holds the task; connections, history and meta go in the right rail. Short navigation (≤ 8 items per module), settings grouped by task, no walls of checkboxes. | U4, U8, U9, U10, U12, U16, U19, U20, U29, U33, U37, U39, U53, U76, U81, U90, U102, U103 |
| 8 | **Policy built in** | Limits, eligibility, SLAs, confidentiality and cascades are product behaviour, not HR memory: OT minimums, expense limits, receipt per line, notice-period calculation, goal cascade, POSH access control. | U14, U35, U48, U49, U51, U55, U60, U61, U69, U70, U74, U75, U82, U85, U86, U99 |
| 9 | **Mobile is the main app for employees** | Every employee-facing flow exists on mobile; one-tap approvals; plain wording; offline-tolerant check-in and drafts. | U23, U68, U94, U95 (+ U11, U91–U93) |
| 10 | **Public pages carry the employer's brand** | Careers pages, candidate portals and letters show the tenant's brand and public-friendly data only. No internal codes, counts or third-party branding. | U78 (+ U77) |
| 11 | **Bulk actions and keyboard-first everywhere** | Multi-select with bulk actions on every list (T2 / T7); inline edit on list cells that hold a plain field; the command palette (Ctrl-K / Cmd-K, P17) reaches every record, action and setting; **no core task deeper than three clicks from Home**. | — (added 26 Sep 2026 from [MARKET-COMPETITOR-ANALYSIS](../../design/MARKET-COMPETITOR-ANALYSIS.md) §4 G10; a market finding, not a recorded U-issue) |
| 12 | **Direction and script follow the locale** | Every screen, PDF and email works right-to-left for Arabic: layouts use logical properties (start / end, never left / right); directional icons, steppers, timelines and time-series charts mirror; logos, media controls, phone numbers, IBANs and code do not; mixed Arabic / Latin strings are bidi-isolated. Digits (Western / Arabic-Indic) and a Hijri date beside the Gregorian one are display choices; files and stored values never change. An Arabic font is self-hosted beside Hanken Grotesk. | — (added 28 Sep 2026, validation pass 3 G1; [P21](../../design/P21-global-readiness.md) YX-GLB-02–04) |
| 13 | **Accessible by default, with evidence** | Target **WCAG 2.2 AA** on every product (HR, Hire, Assess, Analytics, mobile, public pages): keyboard-only paths, focus never hidden by sticky bars, 24 × 24 px targets, no drag-only actions, screen-reader names, 200 % zoom and reflow, contrast in light and dark. Evidence: automated checks in CI and Storybook, manual screen-reader passes per release, an independent audit against WCAG 2.2 AA and **EN 301 549**, and a published **VPAT / ACR per product** before public launch. | — (added 28 Sep 2026, validation pass 3 R19; raises the WCAG 2.1 AA target in T03 Q8 to 2.2 AA) |

All 103 issues map to exactly one of principles 1–10 (plus the cross-references in brackets), so there is a single place to check each one; principle 11 comes from the market analysis and principles 12–13 from validation pass 3 (G1, R19); all three apply to every screen.

---

## 3. Page templates (extends P1–P5 from the Leave pilot)

Almost every HR screen is one of nine templates. Build these first, well, and the rest is composition. Every screen's template is listed in the screen inventory, [Appendix D §2](../../design/APX-D-screens-navigation.md).

| # | Template | Used for | Built from (exam app) | Must-haves |
|---|---|---|---|---|
| T1 | **App shell** | All desktop pages | AppShell, Sidebar, TopBar | Role-based sidebar ≤ 8 items per module; **entity + period switcher** always visible; global search; notification bell |
| T2 | **Queue / list** | Requests, employees, claims, applicants | DataTable, ColumnChooser, FilterableHeader | Saved views as tabs ("Waiting for me"); names not IDs; meaningful status; bulk actions bar; inline Approve/Reject for queues |
| T3 | **Record workspace** (replaces Frappe's long form) | Employee, leave card, appraisal, exit case, trip | Panel, Tabs, Timeline | Header with name, status and **one primary action**; main area = the task; right rail = connections, approvals (ApprovalTimeline), history; activity hides system noise |
| T4 | **Request sheet** | Apply leave, regularise, claim, advance, shift, WFH | Dialog / sheet, TextField, Combobox | Single column; **live summary** of the effect ("5 days · balance after 2.5 · 1 holiday excluded"); policy warnings before submit; derived approver shown, never picked |
| T5 | **Wizard / stepper** | Payroll run, year-end, F&F, onboarding, TDS return, bulk actions | (new) Stepper + FormAlert | Steps with ready / attention states; pre-flight step; preview before commit; per-item progress; downloadable result |
| T6 | **Grid / calendar** | Muster, roster, team leave calendar, holiday calendar, balances matrix | DataTable (virtualised) + new grid cells | Pinned name column; colour + marker per cell; click a cell → side panel; month switcher; export |
| T7 | **Report** | Registers, analytics | DataTable, Recharts | **Defaults always set** (current FY, current entity); totals row at top; pinned columns; export; chart toggle |
| T8 | **Mobile shell** | Employee and manager app | (new, PWA) | 5 bottom tabs (§7.2); cards on a grey ground; primary button pinned at the bottom; approval cards; offline queue |
| T9 | **External-portal shell** (added 26 Sep 2026, GAP F5) | Pre-boarding candidate, alumni + nominee, external trainer, POSH IC external member, audit-committee chair, client contact, candidate test portal, anonymous reporter case page, public verify page, careers site | Exam-app candidate portal (magic link / OTP) | Tenant-branded, single-purpose; **no entity switcher**, no sidebar or global search; OTP session scoped to named records (P02 §4.7) or public / access-code variants; mobile-first; footer links to privacy notice, terms, accessibility statement, cookie notice. Full spec: [Appendix D §4](../../design/APX-D-screens-navigation.md) |

**Dashboards and homes** are compositions of StatCard / IconStatCard / Gauge + lists, always role-based (employee / manager / HR / finance) and scoped (principle 2).

---

## 4. Navigation & information architecture

### 4.1 Desktop — modules and top items (role: HR admin)

| Module | Top-level items (≤ 8) |
|---|---|
| **People** | Directory · Org chart · Onboarding · Changes (promotion/transfer) · Exits · Documents & letters |
| **Time** | Today (board) · Muster · Roster · Leave calendar · Requests · Year-end · Periods · Reports |
| **Pay** | Payroll home (run) · Compensation · One-time pay · Tax centre (HR view) · Expenses & advances · Reports · Settings |
| **Compliance** | Statutory checklist · Registers · TDS returns · Form 16 · POSH (restricted) · Set-up |
| **Performance** | Goals · Reviews & cycles · Feedback · 1:1s · Calibration & comp review · PIPs · Learning · Skills |
| **Helpdesk** | Help centre · Tickets · Knowledge base · Cases · Speak-up · Policies · SLAs |
| **Engage** (added 26 Sep 2026, M09) | Feed · Announcements · Surveys · Recognition · Moderation |
| **Hiring** (exam-app ATS) | Headcount plan · Jobs & requisitions · Pipeline · Interviews · Offers & BGV · Candidates · Careers site · Staffing desk |
| **Proctoring** (exam app) | Question bank · Tests · Drives & schedule · Live · Integrity · Evaluation · Results & reports · Company audit view (T01–T05; candidate side is a T9 portal) |
| **Analytics** | Dashboards · Explorer · Reports · Schedules · Ask (AI) — see [11-analytics.md](11-analytics.md) |
| **Projects** (added 26 Sep 2026, M12) | Projects · Timesheet approvals · Capacity & utilisation · Costing & margin · Billing workbench · Reports |
| **Contract labour** (added 26 Sep 2026, M13) | Contractors · Contract workers · Vendor compliance · CLRA registers & returns · Reports |
| **Visitors** (added 26 Sep 2026, M02 §B11) | Today's visitors · Invites · Visitor log · Kiosks & badges · Reports |
| **Custom** (added 26 Sep 2026, P18) | Company-defined custom objects not placed under another module (builders in Settings › Organisation › Customisation) |

A **global Approvals inbox** (all request types, delegation), the **Search box and command palette** (Ctrl-K / Cmd-K: records, actions, recent items, filtered by P02 at query time; [P17](../../design/P17-global-search.md), added 26 Sep 2026) and **Settings** sit outside the modules. Module settings are not sidebar items; they live in the **Settings map**: 8 groups (Organisation · People & Access · Time & Leave · Payroll & Statutory · Documents & Communication · Hiring & Assessments · Integrations & Developers · Billing & Account), every configurable policy on exactly one page, searchable (P01 §4.6). See [Appendix D §1 (navigation) and §3 (Settings map)](../../design/APX-D-screens-navigation.md).

### 4.2 Roles see different homes
- **Employee:** my day (check-in), my balances, my requests, payslip, tasks due.
- **Manager:** waiting for me, team today (in / late / off), team goals and reviews.
- **HR:** exceptions, run status, statutory due dates, open cases, cycle progress.
- **Finance:** to pay (claims, F&F), payroll approval, statutory payments.

---

## 5. HR component library (new components on top of the exam-app system)

✅ = exists in the exam app (reuse or extend) · 🆕 = build.

| Component | Purpose / where | Status |
|---|---|---|
| **Approval card** | One-tap decision with context (who, what, dates or amount, balance after, "2 others off", attachment); desktop queue row + mobile card | 🆕 (extends ✅ ApprovalDecisionDialog) |
| **Approval trail** | Who approved or rejected when, delegation, next approver | ✅ ApprovalTimeline |
| **Person chip** | Avatar + name (+ role on hover); never an ID | 🆕 |
| **Scope chip** | "Workfox Pvt Ltd · FY 2026-27 · Hyderabad" on every aggregate | 🆕 |
| **Status pill** | HR statuses mapped to the status palette; tested for long labels | ✅ StatusBadge (extend map) |
| **Explained amount** | Number + expandable "how it's calculated" lines | 🆕 |
| **Money summary** | Net-first block: "You will receive ₹X", with the breakdown underneath | 🆕 |
| **Balance card** | Leave / advance / comp-off balance: "10 of 12 left · +1.5 on 31 Oct" | 🆕 |
| **Ledger timeline** | Credits and debits with reasons (leave ledger, advance, loan) | 🆕 (extends ✅ Timeline) |
| **Day card** | Shift bar with punches placed on it; "late 17 m", "OT 2 h 28 m"; Fix / Regularise action | 🆕 |
| **Range picker + half-day ends** | Leave and requests: first/second half per end, holidays and blocked dates shown | 🆕 |
| **Live effect summary** | Under request sheets: days, balance after, sandwich/holiday effect, policy flags | 🆕 |
| **Muster grid cell / roster cell** | Status colour + markers (late, early, OT, regularised); drag in the roster | 🆕 |
| **Stepper** | Wizards (payroll run, F&F, year-end, exit case, onboarding) | 🆕 |
| **Checklist with owners** | Onboarding / exit / pre-flight; owner, due (relative days, negative allowed), done state, progress ring | 🆕 |
| **Pre-flight list** | Blocking vs warning items with a "Fix" link | 🆕 (uses ✅ FormAlert) |
| **Policy flag** | Inline "exceeds limit ₹8,000/night" on a line | 🆕 |
| **Receipt capture** | Camera / upload → OCR preview → confirm fields | 🆕 |
| **Rating & band** | Stars for inputs; bands for outcomes ("Exceeds expectations") | 🆕 |
| **Goal / key-result progress** | Target, current, unit, confidence, check-in | 🆕 |
| **Metric widget** | Card/chart bound to a governed metric; scope chip + definition tooltip + drill-down (11-analytics §5–6) | 🆕 (from ✅ StatCard, Recharts) |
| **Stat funnel** | Clickable stage counts (cycle, onboarding, statutory) | 🆕 (from ✅ StatCard) |
| **Org chart** | Card tree with search and export | 🆕 |
| **Impact preview** | "This change will: holiday list → Chennai, PT → Tamil Nadu…" | 🆕 |
| **Empty / pending states** | "Not due", "Not covered", "Pending manager" — distinct from zero; sample-data toggle in sandbox only | ✅ EmptyState (extend) |
| **Help & onboarding set** (GAP H7) | Role-based first-run tours; contextual help drawer (content model per screen); access-denied vs not-found with "Request access"; **irreversible-action dialog** (impact preview + typed confirmation); "available in wave X" / "not enabled" / "set-up needed" states. Specified in [Appendix D §6](../../design/APX-D-screens-navigation.md) | 🆕 |

---

## 6. Content & formatting rules

### 6.1 Language
- **Plain language, Indian SMB vocabulary:** "Unpaid leave" (with LWP as a tooltip), "Take-home pay", "Days paid".
- **Our own wording.** Never copy Frappe labels, help text or messages.
- **Every status says what happens next:** "Waiting for Priya", not "Open".
- **Errors:** what went wrong + where + how to fix it, in one sentence.

### 6.2 Formats (India first, locale-driven later)

| Item | Rule | Example |
|---|---|---|
| Money | Indian grouping, ₹, no decimals unless needed | ₹1,50,800 · ₹12,566.67 |
| Dates | `d MMM yyyy`, ranges collapsed | 12–16 Oct 2026 |
| Days | Halves as ½; never "0.500" | 2½ days |
| Time | 12-hour with am/pm | 09:32 am |
| Durations | Hours + minutes | 8 h 56 m |
| People | Name first, ID only as secondary text | Priya Sharma · EMP-003 |

### 6.3 Status → colour (one meaning per colour)

| Meaning | Token | Examples |
|---|---|---|
| Done / approved / paid | success | Approved, Paid, Present, Completed |
| Needs someone's action | warning | Waiting for approval, Proof pending, Late |
| Blocked / rejected / failed | danger | Rejected, Failed, Absent, Overdue |
| Neutral / not applicable | neutral | Draft, Not due, Not covered, Weekly off |
| In progress / info | info | Processing, Scheduled, Serving notice |
| Special | purple | On leave, Holiday |

### 6.4 Identifiers
- The system generates IDs; users never type or see a numbering series.
- Public URLs use ASCII slugs.
- No company-suffix codes ("Sales - W") on any public or employee screen.

### 6.5 Help, access and confirmation copy (GAP H7)
- Help topics, tours and empty states follow the content model in [Appendix D §6](../../design/APX-D-screens-navigation.md); employee-facing help in English, Hindi, Tamil and Telugu (P04 Q4), admin help English first.
- "You don't have access" is used only where the record's existence may be known; restricted areas and missing records both say "Not found".
- Irreversible actions state what happens, to whom, what can't be undone and the correction path, then ask for a typed confirmation.

---

## 7. Mobile

### 7.1 Rules
1. Every employee-facing flow exists on mobile (check-in, leave, requests, payslip, tax, expenses, goals, feedback, learning, cases, documents).
2. Approvals are cards with Approve/Reject, swipe and bulk-approve.
3. Read-only data is shown as text, never as disabled inputs.
4. Offline queue for check-in, drafts and receipts.
5. Languages at launch: English, Hindi, Tamil, Telugu.
6. Built for low-end Android: small bundle, works on 3G.
7. Push + WhatsApp notifications, grouped and actionable.

### 7.2 Tabs

| Tab | Contents |
|---|---|
| **Home** | Check-in card (shift, location, selfie option), to-dos, announcements |
| **Time** | Calendar with markers, day card + Fix, balances, apply leave, my shifts |
| **Requests** | Mine / Team (approval cards) |
| **Pay** | Payslips, tax centre, expenses (camera-first), advances, Form 16 |
| **Me** | Profile & documents, goals & feedback, learning, cases, settings |

---

## 8. Target screen inventory (all modules)

The original target was about **90 screens before de-duplication**. **Updated 26 Sep 2026:** the reconciled inventory, now **311 screens** after the gap-register extension (249 + 41 for M12, M13, P17, P18 and the B / C features; Settings map 67 pages) of every screen named in the design docs (incl. Engage, the staffing desk, Proctoring and the T9 portals), with template, doc, personas, wave and desktop / mobile, is [Appendix D §2](../../design/APX-D-screens-navigation.md); the canonical mobile tab map is Appendix D §5 and U-issue closure is Appendix D §7. The table below is kept as the original per-module target. Several screens are shared across modules and built once: the approvals inbox, request sheet, record workspace, checklists and letters.

| Module (UI ref) | Target screens | Key screens | Build wave (spec §4) |
|---|---|---|---|
| Core HR / People (00, 05) | 10 | Employee workspace + timeline, Change action with impact preview, onboarding board + **pre-boarding portal**, exit case stepper, **F&F calculator**, org chart | 1 (core) · 4 (lifecycle, F&F) |
| Leave (01) | 13 | Apply sheet, approvals inbox, **leave card (ledger)**, leave-type editor with preview, **year-end wizard**, team calendar | 2 |
| Attendance & shifts (02) | 12 | Today board, **muster grid** + lock, **day card** + regularise, roster, shift editor with preview, mobile check-in | 2 |
| Payroll (03) | 10 | **Payroll run wizard**, CTC designer, compensation tab, payslip, employee tax centre | 3 |
| Statutory (04) | 7 | Statutory set-up per entity, **monthly statutory checklist**, TDS return wizard, Form 16 bulk | 3 |
| Expenses (06) | 8 | Claim sheet (receipt per line, OCR, policy), approver line view, **trip**, finance "to pay" | 5 |
| Performance (07) | 9 | Goals/OKRs with cascade, cycle control room, appraisal workspace, calibration, 1:1s, PIP | 5 |
| Hiring (08) | +6 on exam-app ATS | **Headcount plan**, skill scorecards, offer → pre-boarding hand-off | after 5 (D9) |
| Analytics (11) | 8 | Role dashboards, **metric explorer**, report builder, report library, schedules, AI ask, metric catalogue | platform (UI-0 widgets) · grows each wave |
| Training, cases, misc (09) | 8 | Learning catalogue + certificates, employee cases (SLA), **POSH (restricted)**, skills matrix, approval rules (stand-ups dropped, P2-3; U88 won't do) | 4 (POSH, D8) · 5 |
| Engage (M09) | 11 (App. D) | Feed, announcements, surveys + results, recognition, moderation | 5 (announcements 1) |
| Proctoring (T01–T05) + T9 portals | 28 + 10 (App. D) | Live console, incident workspace, evaluator console, candidate portal, privacy centre; external portals | Proctoring track · per module |
| Mobile (10) | 5 tabs | Home, Time, Requests, Pay, Me | alongside each wave |
| Projects (M12), Contract labour (M13), Visitors, search & customisation (P17, P18), B / C features | 41 (App. D, added 26 Sep 2026) | Command palette, custom object & layout builders, projects workspace, field-force map, auto-roster, EWA, talent CRM, vendor portals, campus portal, invigilator & candidate apps, DSAR tracker, AI governance | per owning doc (App. D §2) |

---

## 9. Build order for the UI

| Step | Build | Why first |
|---|---|---|
| **UI-0** (with platform wave 1) | T1 app shell with entity/period switcher, T2 queue, T3 record workspace, T4 request sheet, Person chip, Scope chip, Status map, approval card + trail, pre-flight list, empty/pending states, **mobile shell (T8)** | Every later screen uses these |
| **UI-1** (wave 2) | Range picker, live effect summary, balance card, ledger timeline, day card, muster/roster cells (T6), stepper (year-end) | Leave and attendance are daily-use |
| **UI-2** (wave 3) | Explained amount, money summary, T5 wizard (payroll run, TDS), T7 reports | Payroll trust depends on explanations |
| **UI-3** (wave 4) | Checklist with owners, impact preview, F&F calculator, org chart, POSH case views | Lifecycle and compliance |
| **UI-4** (wave 5) | Receipt capture, policy flag, goal/KR progress, rating & band, stat funnel | Expenses, performance, learning |

**Definition of done for every screen:**
- It passes the 11 principles in §2 (a checklist in the PR template).
- Bulk and keyboard path checked (principle 11): the list has multi-select with bulk actions, Ctrl-K reaches the screen, and its core task is at most three clicks from Home.
- Mobile layout checked.
- Numbers match their report.
- Dark mode works.
- Keyboard and screen-reader basics are covered.

---

## 10. Decisions for the team

1. ✅ **Decided 25 Sep 2026 (D16): Design system home:** evolve the exam app's `ui-v2` into a shared package (`packages/ui`) used by all four products. *Recommended; it fits D11 (one codebase).*
2. ✅ **Decided (M04 Q1): Mobile delivery:** PWA first in wave 2, Capacitor store apps in wave 3. Original note: PWA first (as Frappe does), with a native wrapper (Capacitor) later only if device features need it. Offline check-in and push work in a PWA on Android.
3. ~~**Languages at launch**~~ ✅ **Decided 24 Sep 2026 (P04 Q4):** English, Hindi, Tamil, Telugu for employee-facing screens and notifications; admin screens English first.
4. ✅ **Decided 25 Sep 2026 (D16): Storybook now, Figma later.** Design tool: keep designs as coded components + Storybook (fast for a 4–5 person team), or add Figma?
5. ✅ **Decided 25 Sep 2026 (D16): rename at public launch** (pilot still shows Workfox). Rename: when to move "Workfox" branding to YukthiX. It should happen during UI-0 so HR screens never ship under the old name.
6. ✅ **Decided 26 Sep 2026 (market analysis G10): bulk actions and keyboard-first everywhere** — principle 11 in §2: multi-select on every list, inline edit, command palette (P17), and a target of **no core task deeper than three clicks from Home**. Built into UI-0 (T2 queue multi-select, palette hooks) so later screens inherit it; the three-click target is checked per core task in the PR template and against the Appendix D §2 inventory.
7. ✅ **Decided 28 Sep 2026 (validation pass 3 G1 + R19, founder decision; [P21](../../design/P21-global-readiness.md)): RTL-ready and accessible from UI-0.** `packages/ui` uses logical CSS properties only (lint in CI) and Storybook renders every component in `ar` as well as `en`; Arabic screens, templates and fonts are built before the first GCC customer (principle 12). Accessibility target **WCAG 2.2 AA** for all products with automated and manual checks per release; an independent **EN 301 549 / WCAG 2.2 AA** audit and a **VPAT / ACR per product** before public launch (principle 13).

---

## Sources
- Module UI references: [01](01-leave-management.ui-reference.md) · [02](02-attendance-and-shifts.ui-reference.md) · [03](03-payroll-engine.ui-reference.md) · [04](04-india-statutory.ui-reference.md) · [05](05-employee-lifecycle.ui-reference.md) · [06](06-expenses-advances-travel.ui-reference.md) · [07](07-performance.ui-reference.md) · [08](08-recruitment.ui-reference.md) · [09](09-training-grievance-misc.ui-reference.md) · [10](10-mobile-pwa.ui-reference.md) · [11 Analytics](11-analytics.md)
- Screenshots: `reference/ui-screens/` (internal only).
- Exam-app design system: `D:\exam app\apps\web\tailwind.config.ts`, `app/v2/v2.css`, `components/ui-v2/` (read-only inspection, 24 Sep 2026).
- Functional gaps and decisions: [99-gap-summary.md](99-gap-summary.md), `spec.md` §5 (D1–D17).
- Screen inventory, navigation, Settings map, T9, help patterns and U-issue closure: [Appendix D](../../design/APX-D-screens-navigation.md) (26 Sep 2026).
