# YukthiX console: designs and what exists (audit)

This file checks, story by story, every design under `Screens/YukthiX console/` against what is live, in the same shape
as `visitors-design-map.md` and `help-onboarding-design-map.md`. Founder rule: never build a second, simpler version of a
designed screen; make the designed one live.

Status 11 Nov 2026 (branch `docs/yukthix-console-map`, from `test/yukthix-main` at a2b511899). Audit only: nothing was
built.

## What is live today (plain English)

- **The YukthiX staff console is live at `/staff`** (`apps/web/app/staff`). Staff sign in at `/staff/sign-in` and then
  use these pages: Companies, one company, a company's settings, Support desk (list and ticket), Support sessions, Plans
  and prices, What's new, Shared SMS account, Audit log and My security. All 19 stories of "Platform console (step 3)"
  and "Support desk (SD-1.31)" are live as drawn. Two of them are on the company side: the company's own Support access
  page (`/yx/settings/support-access`).
- **The rules engine has a back end but no screen.** The API has a staff-only statutory rule store
  (`apps/api/src/statutory/statutory.controller.ts`, `/platform/statutory/rule-sets`): list, draft, publish. Publishing
  runs the shape checks and every golden case. The person who drafted a rule set cannot publish it (checked in code and
  in the database). Publishing needs the security key again. No web page calls it, so YX-01 to YX-03 are mostly "wire
  design".
- **Customers (YX-04) is drawn twice.** The live Companies pages (`CompaniesScreen`, `CompanyScreen`) do the job of the
  drawn Tenants list and Tenant detail (`TenantsListScreen`, `TenantDetailScreen`), including asking a company for
  support access. Those rows are "live (gap)". Tenant health, churn alerts, the admin message composer and feature flags
  are not built.
- **Everything else is drawn only:** AI governance (YX-05), partners (YX-06 to YX-08), product analytics (YX-09),
  incidents and maintenance (YX-10), the help-centre editor (YX-11), nudges (YX-12), sales-assist (YX-13), money
  (YX-14 to YX-17) and Contain tenant (YX-18). No API exists for any of them (searches below).

### Security facts that matter for a staff console

- **Sign-in.** Staff sign in at `/staff/sign-in` (`POST /auth/platform/login`: work email and password), then must use
  their **hardware security key**. Staff are never offered a recovery code (`auth.service.ts` line 630, "staff: security
  key only"). The console layout blocks every page until a key is added (`apps/web/app/staff/(console)/layout.tsx`).
- **Every console API call** goes through `PlatformStaffGuard` (`apps/api/src/platform/platform-staff.guard.ts`). It lets
  in only a YukthiX staff account with no company, signed in with the key (AAL2), on its own platform session, never from
  inside a company or while impersonating. Each route then names its `platform.*` key (`PermissionsGuard`).
  Risky actions also need the key again (step-up): suspend or close a company, change a price, change the SMS account,
  publish a rule set.
- **Reading across companies.** The database uses row-level security. Staff code may turn on the bypass
  (`app.is_super_admin`, set in `packages/shared/src/prisma/tenant-prisma.service.ts`) only through `platformRead`
  (`apps/api/src/platform/platform.service.ts`). Each use writes a `platform.cross_tenant_read` row to the audit log with
  its purpose, in the same transaction.
- **Looking inside a company** needs a support session that a company System Admin approves (`/support-access`, step-up).
  The session lasts at most 72 hours (requests lapse after 24 hours). It is read-only, covers only a fixed list of HR
  pages (`SUPPORT_READABLE` in `platform/support-session-access.ts`), and every page opened is written to the company's
  audit log, which the company sees.
- **Audit.** Every console write is audited: company changes, prices, support sessions, What's new, rule-set draft and
  publish (`platform.statutory.drafted` / `.published`). The Audit log page shows them, and can include reads.

### Answer 975 and H-7

- **975 (look up a "Not found" reference across companies).** **No console story draws it.** The nearest screen is the
  Support desk ticket (SD-1.31). Slice **C-3** below adds "Look up a reference" to Console › Support desk (question
  1051).
  **Finding:** answer 975 says staff can already look a reference up "inside the company's support session, as built".
  The code says otherwise. The look-up is `GET /help/not-found/:code` (`apps/api/src/help/help.controller.ts`), but
  `/help` is not in the support session's page list (`SUPPORT_READABLE`), so the API refuses it with
  `SUPPORT_SESSION_OUT_OF_SCOPE`. The screen for it is under Helpdesk › Tickets (`/desk`), which is not on the list
  either. I read this in the code and did not run it, so treat it as "very likely blocked" (question 1052).
- **H-7 (company wizard, module switches, availability)** waits on this console:
  - **Company wizard (PLT-09)** is drawn outside this group (`Screens/Platform/Set-up & administration`,
    `TenantWizardScreen`). It would start from Console › Companies › New company (story `Companies`; today a simple
    drawer).
  - **Module switches**: the products a company has are already set in the console (New company, Plans, Company
    settings, all live). Switching single features on or off is drawn in YX-04 `Flags` and `KillSwitch`.
  - **Availability (maintenance)** is drawn in YX-10 `Maintenance` and `MaintenanceBlocked`.
  - All three go in slice **C-5**.

Verdicts (the same words as the other maps): **live** · **live (gap)** (the live app does the job with another kit
screen, named in the note) · **wire design** (the API exists and the screen is not wired) · **design only, feature not
built** · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

After C-1 to C-5, C-8 parts 1 and 2 (with the payroll-day note), staff roles parts 1 and 2, 1165 and the console tidy-ups
1 and 2 (12 Nov 2026; tidy 2 adds the withdraw story; appendix script "ok").

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Live console | 3 | 30 | 0 | 0 | 0 | 0 | 30 |
| B. Rules engine (YX-01 to YX-03) | 3 | 26 | 5 | 0 | 0 | 0 | 31 |
| C. Customers and containment (YX-04, YX-18) | 2 | 26 | 2 | 0 | 0 | 0 | 28 |
| D. Partners (YX-06 to YX-08) | 3 | 0 | 0 | 0 | 10 | 0 | 10 |
| E. Money (YX-14 to YX-17) | 4 | 0 | 0 | 0 | 8 | 0 | 8 |
| F. The rest (YX-05, YX-09 to YX-13) | 6 | 19 | 0 | 0 | 13 | 0 | 32 |
| **All A-F** | **21** | **101** | **7** | **0** | **31** | **0** | **139** |

Counted by script on 11 Nov 2026 on `docs/yukthix-console-map` (the script is in the appendix). There are 87 stories in
20 files whose title starts `Screens/YukthiX console/`: `screens/console/console.stories.tsx` (14),
`screens/console/support-desk.stories.tsx` (5) and `screens/portals/yx-01.stories.tsx` to `yx-18.stories.tsx` (5, 5, 5,
12, 5, 5, 3, 2, 3, 5, 2, 2, 2, 4, 1, 2, 1, 4). Story names are the exported names that start with a capital letter. None
is a phone view.

## 1. Live pages

| page | screen | API |
|---|---|---|
| `/staff/sign-in` | `StaffSignInScreen`, `MfaChallengeScreen` (auth kit) | `POST /auth/platform/login`, then the security key |
| `/staff/companies` | `CompaniesScreen` | `GET/POST /platform/companies` |
| `/staff/companies/[id]` | `CompanyScreen` | `GET /platform/companies/:id`, `lifecycle` (step-up), `extend-trial`, `support-sessions` |
| `/staff/companies/[id]/settings` | `CompanySettingsScreen` | `GET/PATCH /platform/companies/:id/settings` |
| `/staff/support-desk`, `/staff/support-desk/[id]` | `SupportDeskQueueScreen`, `SupportDeskTicketScreen` | `/platform/support-desk/tickets…` (`ConsoleDeskController`, `service-desk/public-desk.controller.ts`) |
| `/staff/support` | `SupportSessionsScreen` | `GET /platform/support-sessions`, cancel, end |
| `/staff/plans` | `PlansScreen` | `/platform/products`, prices (step-up) |
| `/staff/whats-new` | `WhatsNewConsoleScreen` | `/platform/whats-new` (`WhatsNewStaffController`, `help/whats-new.controller.ts`) |
| `/staff/audit` | `PlatformAuditScreen` | `GET /platform/audit` |
| `/staff/incidents` (C-8) | `IncidentComposerScreen liveIncidents` | `/platform/incidents…` (`platform/incidents.controller.ts`) |
| `/staff/help-centre` (C-8) | `HelpEditorScreen live` | `/platform/help-centre…` (`service-desk/help-centre.controller.ts`) |
| `/yx/settings/support-access` (company side) | `SupportAccessScreen` (`screens/access/support-access.tsx`) | `/support-access` (approve is step-up) |

## 2. Live pages with no design in this group

- `/staff/channels`: Shared SMS account. It renders `SmsSettingsScreen` from the Notifications designs.
- `/staff/security`: the staff member's own security keys. It is the same page as YukthiX My security
  (`yx/(app)/me/security`).
- The older `/v2/(platform)` pages (Organizations, Plans, Platform admins, All users; "Workfox platform identity") are
  still in the app. They call older APIs such as `billing/plans.controller.ts` (`@Controller('platform')`, key
  `platform:manage_organizations`), which do **not** use `PlatformStaffGuard`. Unsure: I did not check whether those
  routes still let a staff member in from inside a company. See question 1060. **Platform admins is marked for retirement**
  (12 Nov 2026): Console › Staff and roles now adds and deactivates staff (answer 1164); not deleted yet.

## 3. Designs with no live page or API

The 49 "design only" rows: YX-02 Runner and Running, YX-03 Impact, YX-04 Health, Alerts, Composer, Flags and KillSwitch,
and every story of YX-05 (5), YX-06 (5), YX-07 (3), YX-08 (2), YX-09 (3), YX-10 (5), YX-11 (2), YX-12 (2), YX-13 (2),
YX-14 (4), YX-15 (1), YX-16 (2), YX-17 (1) and YX-18 (4).

**Searches run** (11 Nov 2026, on `test/yukthix-main`):

- Kit screens in the web app: `grep -rlE "RuleSetEditorScreen|GoldenCasesScreen|PublishSchedulerScreen|AiGovernanceScreen|ContainTenantScreen|CostPerTenantScreen|CustomerSuccessScreen|FeatureFlagsScreen|HelpEditorScreen|IncidentComposerScreen|NudgeEditorScreen|ProbesScreen|ProductAnalyticsScreen|SalesAssistScreen|TenantDetailScreen|TenantsListScreen|CommissionsScreen|DirectoryModerationScreen|EInvoiceLogScreen|ExportBillingScreen|PartnerVerificationScreen|RegionCatalogueScreen" apps/web`: **no hits**. In `packages/yx-ui/src` they appear only in their own files
  (`screens/portals/console-rules.tsx`, `console-ops.tsx`, `console-finance.tsx`), the YX stories and
  `design-live-guard.known.json` (all on its `notLive` list).
- API (`apps/api/src`, `*.ts` without specs), keyword: result.
  - `feature.?flag|kill.?switch`: none.
  - `product.?analytics`: none.
  - `sales.?assist`: none. The `Lead` table only stores landing-page sign-ups (`leads.controller.ts` has `POST` only).
  - `\bLUT\b|FIRC|export.?invoice`: none.
  - `cost.?per.?tenant|tenant.?cost`: none.
  - `region.?catalog`: only `org-validation.ts` (not a catalogue).
  - `churn|health.?score`: only a per-ticket health score in `service-desk/support-bridge.service.ts` (`tenantPanel`).
  - `partner`, `commission`, `listing`: hits are unrelated (travel partners, job boards, payroll starter).
  - `incident`, `maintenance`, `probe`: hits are unrelated (Service Desk incidents, visitor rules, kiosk). `health/` is
    the server's liveness check only.
  - `e.?invoice|IRN`: `expenses/einvoice.ts` reads supplier e-invoice QR codes on expense receipts. It is not YukthiX's
    own e-invoice log.
  - `cert-?in|breach.?clock|contain(ed|ment)`: none related.
  - `ai.?registry|model.?registry|drift|red.?team`: none related. `ai/ai-invocation.service.ts` records AI credit spend
    per company (useful for YX-17).
- Schema (`apps/api/prisma/schema.prisma`) model names with Partner, Incident, Region, Lut, Cost, Flag, Listing,
  Commission, Probe: no console model. `Nudge` is the PLT-02 manager nudge, not trial nudges.

## 4. Design groups, story by story

### A. Live console

#### Platform console (step 3)

| story (sub-page) | verdict | note |
|---|---|---|
| Companies · Companies | live | `/staff/companies` renders `CompaniesScreen` with `GET /platform/companies` (`platform.companies.view`); New company is `POST` (`platform.companies.manage`) |
| CompaniesLoading · Companies · loading | live | same page; `loadState` in `apps/web/lib/yx-console.ts` gives `loading` |
| Company · Company · trial with an open support session | live | `/staff/companies/[id]`, `CompanyScreen`; suspend and close are step-up (`@RequireStepUp`) |
| CompanyFeatures · Company · products and features (C-5) | live | `/staff/companies/[id]`: plan products and the plan features YukthiX switches on (Company settings); C-4 switches join here |
| CompanyNoSession · Company · ask for support access | live | same page; `POST /platform/companies/:id/support-sessions` (`platform.support.request`) |
| CompanySettings · Company settings · white-label in the plan | live | `/staff/companies/[id]/settings`, `CompanySettingsScreen`, `GET/PATCH …/settings` |
| CompanySettingsNotInPlan · Company settings · not in the plan | live | same page; the API says what is in the plan |
| Plans · Plans and prices | live | `/staff/plans`, `PlansScreen`; prices are step-up (`platform.plans.manage`) |
| WhatsNew · What's new · entries | live | `/staff/whats-new`, `WhatsNewConsoleScreen`, `WhatsNewStaffController` (`platform.news.manage`) |
| WhatsNewAdd · What's new · new entry | live | same page, `POST /platform/whats-new` |
| WhatsNewEmpty · What's new · none yet | live | same page with no entries |
| Support · Support sessions | live | `/staff/support`, `SupportSessionsScreen`, `GET /platform/support-sessions` |
| Audit · Audit log | live | `/staff/audit`, `PlatformAuditScreen`, `GET /platform/audit?reads=` (`platform.audit.view`) |
| CompanySupportAccess · Company side · Support access (PLT-17) | live | `/yx/settings/support-access`, `SupportAccessScreen`, `/support-access` (`org.support_access.approve`; approve is step-up) |
| CompanySupportAccessMessages · Company side · Support access · messages from YukthiX (C-2) | live | `/yx/settings/support-access`, `GET /support-access/messages` (its own copies only, forced RLS); the bell links here |
| CompanySupportAccessEmpty · Company side · Support access · none yet | live | same page with no sessions |
| StaffRoles · Staff and roles | live | Staff roles (12 Nov 2026): `/staff/staff`, `StaffRolesScreen`; `GET /platform/staff` (Security lead key `platform.staff.manage`, an audited `platformRead`): every staff account with its roles and what each role holds (answer 1058) |
| StaffRolesChange · Staff and roles · change roles | live | `PUT /platform/staff/:id/roles` with a reason and the security key again; never your own roles (no action on your row; API and database refuse) |
| StaffRolesLastLead · Staff and roles · the last Security lead | live | the last active Security lead keeps the role (screen, API, database) |
| StaffRolesNoKey · Staff and roles · not a Security lead | live | 403 from the API shows no access |
| StaffAdd · Staff and roles · add staff | live | Answer 1164: `POST /platform/staff` (Security lead, the security key again, a reason; audited): an invitation to set a password, then a security key at first sign-in; no role until one is given. Deactivate: `POST /platform/staff/:id/deactivate` (never yourself, never the last Security lead; signed out everywhere) |
| StaffInvitedAndInactive · Staff and roles · invited and deactivated (send again, reactivate) | live | Answers 1171, 1173: `POST /platform/staff/:id/reactivate` (the roles they held; they sign in again with their security key) and `POST /platform/staff/:id/resend-invitation` (only for someone who never signed in; the old link stops; 3 a day by default), each with the security key again and a reason, audited |

#### Support desk (SD-1.31)

| story (sub-page) | verdict | note |
|---|---|---|
| QueueStory · Queue | live | `/staff/support-desk`, `SupportDeskQueueScreen`, `GET /platform/support-desk/tickets?state=` (`platform.support_desk.work`) |
| NotAgent · Queue · not a support agent | live | the API's 403 "not a YukthiX Support agent" shown through `notAgent` (`apps/web/lib/yx-support-desk.ts`) |
| Ticket · Ticket · Priority Support | live | `/staff/support-desk/[id]`, `SupportDeskTicketScreen`; the tenant panel is an audited `platformRead` |
| Asked · Ticket · access asked | live | `POST …/tickets/:id/request-access` (needs both `platform.support_desk.work` and `platform.support.request`) |
| Unlinked · Ticket · not linked | live | `POST …/tickets/:id/link` |
| LookUpReference · Queue · look up a Not found reference (two companies) | live | C-3 (1051): `GET /platform/support-desk/references/:code` |

#### Platform settings (1125)

| story (sub-page) | verdict | note |
|---|---|---|
| List · Platform settings · list (one to verify with counsel) | live | `/staff/platform-settings`, `PlatformSettingsScreen` (added to the kit first: no drawn screen), `GET`/`PUT platform/settings` |
| ReadOnly · Platform settings · without the key | live | the no-access state |

### B. Rules engine (YX-01 to YX-03)

#### YX-01 · Rule-set editor

| story (sub-page) | verdict | note |
|---|---|---|
| YX01List · Rule sets list | live | C-1 (12 Nov 2026): `/staff/rules`, `RuleSetEditorScreen` with `live`; `GET /platform/statutory/rule-sets` (Rules editor key) with the review states and the drafter named; a new version starts as "Copy as new version" |
| YX01Loading · Rule sets list · loading | live | the same list while it loads |
| YX01Draft · Slab editor · draft | live | `/staff/rules/[id]`: the drafter changes their draft (`PATCH …/rule-sets/:id`, only the drafter, only a draft) and sends it for review (`POST …/send-for-review`); the valid-from and valid-to dates are a card on the live editor |
| YX01Invalid · Slab editor · overlap, no source | live (gap) | the API answers `RULE_SHAPE` with the problems and the editor lists them (pressed too early, never disabled); the source is a text naming the notification and its link, not an uploaded file (question 1062) |
| YX01Published · Published version (locked) | live | read-only, with "Copy as new version" (a draft under a new version name) |
| YX01LiveList · C-1 · Rule sets list (live: in review, changes requested) | live | the review states of answer 1042 in the list |
| YX01ChangesRequested · C-1 · Changes requested · the drafter reads the note | live | `POST …/request-changes` returns it to draft with the reviewer's note (answer 1042) |
| YX01InReviewOther · C-1 · In review · a second member of staff | live | Review opens YX-02's review drawer |
| YX01InReviewMine · C-1 · In review · the drafter waits | live | the drafter cannot change it or review it |
| YX01OtherKind · C-1 · Draft of another kind (values as data) | live | rule kinds other than PT slabs are edited as data (JSON); the shape checks run on save (question 1063) |
| YX01NoKey · C-1 · Without the Rules editor key | live | 403 from the API shows this |

#### YX-02 · Golden-case runner and review

| story (sub-page) | verdict | note |
|---|---|---|
| YX02Runner · Golden cases · 2 failing | live | C-1 (12 Nov 2026): `/staff/rules/golden?id=`; "Run all cases" is `POST …/rule-sets/:id/run`, a dry run that saves nothing but its audit row (answer 1043) |
| YX02Running · Golden cases · running | live | while the dry run runs |
| YX02Queue · Review queue | live | in review and changes requested, from the same list |
| YX02Review · Review drawer (checker) | live | Approve goes on to YX-03 to publish; Request changes needs a note of 10 characters or more the drafter reads (answer 1042) |
| YX02SelfReview · Maker cannot review own change | live | the drafter is refused by the screen, the API (403) and the database (`YX_MAKER_CHECKER`) |
| YX02DryRunNotRun · C-1 · Dry run · not run yet | live | the cases of the version before a run |
| YX02DryRun · C-1 · Dry run · 1 failing (nothing saved) | live | each case's expected and actual result |
| YX02LiveReview · C-1 · Review drawer · ask for changes | live | `POST …/request-changes` |
| YX02LiveSelf · C-1 · Review drawer · the drafter cannot review | live | as YX02SelfReview |
| YX02LiveQueueEmpty · C-1 · Review queue · nothing waits | live | the empty queue |

#### YX-03 · Publish scheduler

| story (sub-page) | verdict | note |
|---|---|---|
| YX03Version · Publish · version | live | C-1 (12 Nov 2026): `/staff/rules/publish`; only versions in review that someone else drafted (answer 1041) |
| YX03Impact · Publish · tenant impact | live (gap) | `GET …/rule-sets/:id/impact` through `platformRead` (audited with its purpose): companies and employees working in the jurisdiction today, and by company size, numbers only (answer 1044). Not shown: how many people's PT changes (pay data stays behind the pay guard; question 1064) |
| YX03PastDated · Publish · past-dated (arrears proposals) | live (gap) | a past valid-from says companies get arrears proposals (PAY-7.03); how many is not shown (pay data, question 1064) |
| YX03Review · Publish · review | live (gap) | `POST …/publish` asks for the security key again (step-up) and runs the shape checks and golden cases; the Notices step is not built (question 1065) |
| YX03Done · Published and scheduled | live (gap) | published, applying on its date; no notices to companies yet (question 1065) |
| YX03LiveImpact · C-1 · Impact · companies and employees (numbers only) | live | the impact step with its chart (sizes with fewer than 5 companies are hidden) |
| YX03LiveNotCountable · C-1 · Impact · a jurisdiction that cannot be counted | live | "EU", "GENERIC" and similar are not places with locations |
| YX03LiveNothing · C-1 · Version · nothing to publish | live | nothing in review that someone else drafted |
| YX03LiveDone · C-1 · Published | live | done, with its date |
| YX03LiveNotice · C-1 · Published · Notices to the companies in its state | live | 1065: `POST platform/customers/rule-notices/:ruleSetId`, an admin message to the companies with a location in the rule's country or state |

### C. Customers and containment (YX-04, YX-18)

#### YX-04 · Customer-success console and tenants

| story (sub-page) | verdict | note |
|---|---|---|
| YX04Tenants · Tenants list | live | answer 1045: the story draws the live `CompaniesScreen` (`/staff/companies`); the drawn `TenantsListScreen` is retired |
| YX04TenantsError · Tenants list · error | live | `CompaniesScreen` error state (`ConsolePage` `ErrorState`) |
| YX04Health · Tenant health | live | C-2: `/staff/customers`, `CustomerSuccessScreen live`; the one health score (`service-desk/tenant-health.ts`, also the Support desk panel), read through `platformRead` (`customer_success.health`). Not built: 30-day change, churn band, CS owner (question 1082) |
| YX04Alerts · Churn-risk alerts | live | C-2: alerts from the platform settings (score below 50, no System Admin sign-in for 30 days); "Log outreach" and alert owners not built (question 1083) |
| YX04Composer · Admin message composer (second approval) | live | C-2: one company sends at once; more than one waits for another staff member (never the writer; approve is step-up). Not built: kind, channel, send-on date, the 2-a-week limit, a chosen approver (questions 1084, 1085) |
| YX04Tenant · Tenant detail | live | answer 1045: the story draws the live `CompanyScreen`; the drawn `TenantDetailScreen` is retired. Money facts come with the money slices |
| YX04SupportRequest · Support access · request | live | `CompanyScreen` (reason, ticket number, hours); fixed set of HR pages (answer 1046) |
| YX04SupportWaiting · Support access · waiting for tenant consent | live | `CompanyScreen` with a requested session |
| YX04SupportActive · Support access · approved session | live | `CompanyScreen` open or end session |
| YX04SupportDeclined · Support access · declined | live | `CompanyScreen` with a declined session |
| YX04HealthLive · Tenant health · from account signals (C-2) | live | `/staff/customers`: score, band, main factor, lifecycle, last admin sign-in, open tickets; Message admins from ticked rows |
| YX04AlertRules · Churn-risk alerts · rules from platform settings (C-2) | live | `GET/PUT /platform/customers/settings` (audited `platform.cs.settings_changed`) |
| YX04MessagesWaiting · Messages · waiting for a second staff member (C-2) | live | `POST /platform/customers/messages/:id/approve` (step-up) and `/reject` (reason) |
| YX04MessagesMine · Messages · my message waiting, Withdraw (1087) | live | `POST platform/customers/messages/:id/withdraw` (writer only; audited) |
| YX04HealthHistory · Tenant health · 30-day change, churn risk and CS owner (1165) | live | 1165: nightly snapshot (`cs_health_snapshots`), owner (`cs_accounts`), Assign owner |
| YX04AlertFollowUp · Churn-risk alerts · owner, status and Log outreach (1165) | live | 1165: `cs_alerts`, `cs_alert_notes`; resolved by itself when the alert clears |
| YX04OwnerLeft · Tenant health · Owner left, listed for reassignment (1223) | live | 1223: a deactivated owner shows as Owner left on the company and its alerts; reassigning moves the open alerts |
| YX04ComposerTwo · Message composer · two companies need approval (C-2) | live | `POST /platform/customers/messages` |
| YX04Flags · Feature flags | live | C-4 (1049): `/staff/feature-flags`, the drawn `FeatureFlagsScreen` with `live`; four real switches over existing company settings |
| YX04KillSwitch · Feature flags · kill switch | live | C-4: kill switch with a reason and the security key again; a second staff member turns it back on |
| YX04FlagsLive · Feature flags · live (kill switch engaged) | live | C-4: the story of the live screen with sample data |

#### YX-18 · Contain tenant

| story (sub-page) | verdict | note |
|---|---|---|
| YX18StepUp · Contain tenant · step-up needed | live (gap) | C-4: the app's own step-up dialog asks for the security key (the drawn code box is not used) |
| YX18Ready · Contain tenant · ready | live (gap) | C-4 (1050): `/staff/companies/[id]/contain`. Gap: whole company only (no one-entity scope); no API keys or partner grants exist to revoke; MFA is not forced (questions 1121-1123) |
| YX18Contained · Contained + tenant banner | live | C-4: holds refused by the API (423 COMPANY_CONTAINED), breach clock from platform settings, banner on every page of the company's app |
| YX18Lift · Lift (two people) | live | C-4: one staff member asks, another lifts (also a database check) |
| YX18LiveReady · Contain company · live, ready | live | C-4: the story of the live screen |
| YX18LiveContained · Contain company · live, contained | live | C-4: the story of the live screen |
| YX18LiveLift · Contain company · live, lift waiting for you | live | C-4: the story of the live screen |

### D. Partners (YX-06 to YX-08)

#### YX-06 · Partner verification

| story (sub-page) | verdict | note |
|---|---|---|
| YX06Queue · Partner applications | design only, feature not built | no partner model or API (searches in section 3) |
| YX06Review · Application review (ICAI pending) | design only, feature not built | as above |
| YX06Partners · Partner list and hierarchy | design only, feature not built | as above |
| YX06Suspend · Suspend partner | design only, feature not built | as above |
| YX06Empty · No applications | design only, feature not built | as above |

#### YX-07 · Partner commissions and invoices

| story (sub-page) | verdict | note |
|---|---|---|
| YX07Lines · Commission lines | design only, feature not built | no commissions |
| YX07Invoices · Consolidated partner invoices | design only, feature not built | as above |
| YX07Loading · Loading | design only, feature not built | as above |

#### YX-08 · Partner directory moderation

| story (sub-page) | verdict | note |
|---|---|---|
| YX08Listings · Directory listings | design only, feature not built | no partner directory |
| YX08Reviews · Reviews and complaints | design only, feature not built | as above |

### E. Money (YX-14 to YX-17)

#### YX-14 · Export invoices, LUT and FIRC

| story (sub-page) | verdict | note |
|---|---|---|
| YX14Receipts · Receipts to match | design only, feature not built | no export billing (search `LUT|FIRC|export.?invoice`: none). Billing today is Stripe checkout (`billing/`) |
| YX14Lut · LUT register | design only, feature not built | as above |
| YX14Invoices · Export invoices | design only, feature not built | as above |
| YX14NoLut · No valid LUT | design only, feature not built | as above |

#### YX-15 · Region catalogue

| story (sub-page) | verdict | note |
|---|---|---|
| YX15 · Region catalogue | design only, feature not built | no region catalogue. Country packs exist for companies (`global/global.controller.ts`, `GET /global/countries`) and could feed it |

#### YX-16 · E-invoice log

| story (sub-page) | verdict | note |
|---|---|---|
| YX16 · E-invoice log | design only, feature not built | no e-invoices for YukthiX's own sales. `expenses/einvoice.ts` only reads supplier QR codes |
| YX16Loading · E-invoice log · loading | design only, feature not built | as above |

#### YX-17 · Cost per tenant

| story (sub-page) | verdict | note |
|---|---|---|
| YX17 · Cost per tenant | design only, feature not built | no cost view. Inputs exist: AI credit spend per company (`AiCreditUsage`, `ai/ai-invocation.service.ts`), public API usage (`api-usage/`), SMS deliveries (`/platform/channels/sms/deliveries`) |

### F. The rest (YX-05, YX-09 to YX-13)

#### YX-05 · AI governance console

| story (sub-page) | verdict | note |
|---|---|---|
| YX05Registry · AI registry | design only, feature not built | no AI model registry. **Name clash:** a different `AiGovernanceScreen` (company side) is in `screens/platform-a/governance.tsx`; neither is live |
| YX05Gate · Promotion gate blocked | design only, feature not built | as above |
| YX05Drift · Drift | design only, feature not built | as above |
| YX05Bias · Bias (4/5ths) | design only, feature not built | as above |
| YX05RedTeam · Red-team log | design only, feature not built | as above |

#### YX-09 · Product analytics

| story (sub-page) | verdict | note |
|---|---|---|
| YX09 · Product analytics | design only, feature not built | no product analytics (search: none). `analytics/` is hiring and question analytics for companies |
| YX09Loading · Product analytics · loading | design only, feature not built | as above |
| YX09NoAccess · No product analytics role | design only, feature not built | as above |

#### YX-10 · Incidents, status admin and probes

| story (sub-page) | verdict | note |
|---|---|---|
| YX10List · Incidents and maintenance | live | C-8: `/staff/incidents`, `IncidentComposerScreen liveIncidents` (the incident list; maintenance is its own page, C-5) |
| YX10Compose · Incident update composer | live | same page: Declare incident and Post an update (stage, impact, what to do, next update; products; severity), the preview, a second staff member approves. Regions are not built (question 1205); the payroll-day note is built (answer 1206) |
| YX10Maintenance · Maintenance · passes checks | live | C-5: `/staff/maintenance`, `IncidentComposerScreen live` (the maintenance part); checks from platform settings; second staff member approves |
| YX10MaintenanceBlocked · Maintenance · payroll window blocked | live | same page: the payroll-critical days, statutory dates and notice refuse the window with the reason |
| YX10MaintenanceLive · Planned maintenance · schedule and approve (C-5) | live | `GET|POST platform/maintenance`, `POST .../:id/approve`, `POST .../:id/cancel`, `PUT .../settings` (`platform.maintenance.manage`) |
| YX10MaintenanceTooSoon · Planned maintenance · too little notice (C-5) | live | same page, the notice rule (72 hours by default) |
| YX10MaintenanceViewOnly · Planned maintenance · Customer success sees the windows (staff roles) | live | Staff roles: `platform.maintenance.view` (Customer success) opens the list; scheduling, approving, cancelling and the rules stay with `platform.maintenance.manage` (Security lead) |
| YX10BannerBefore · What companies see · the day before (C-5) | live | every signed-in page: `GET /availability`, `AvailabilityBanner live` in the app layout |
| YX10BannerDuring · What companies see · during the window (C-5) | live | same, during the window; never blocks sign-in |
| YX10IncidentsLive · Incidents · list and what companies see (C-8) | live | `GET|POST platform/incidents` (`platform.incidents.manage`) |
| YX10IncidentApproveLive · Incident · another staff member approves the update (C-8) | live | `POST platform/incidents/:id/updates`, `.../updates/:updateId/review` (never the writer; service and database check) |
| YX10BreachLive · Incident · security breach and its reminders (C-8) | live | answer 1124: `POST platform/incidents/:id/breach`; the containment's CERT-In and DPDP clocks; sweep `incident-breach-reminders` emails staff with the key; lead time a platform setting |
| YX10BannerIncident · What companies see · an open incident (C-8) | live | `GET /availability` `incident` (companies with an affected product only; never a breach), `AvailabilityBanner kind="degraded" incident` in the app layout |
| YX10Probes · Probes | design only, feature not built | no probes and no probe data in the API (question 1204) |

#### YX-11 · Help-centre editor

| story (sub-page) | verdict | note |
|---|---|---|
| YX11List · Help articles and no-result searches | live | C-8: `/staff/help-centre`, `HelpEditorScreen live`: the platform company's "YukthiX help" articles, the pages each explains, and the searches with no result across companies (counts only, at least 5 companies) |
| YX11ListLive · Help articles and no-result searches (C-8) | live | `GET platform/help-centre` (`platform.helpcentre.write`); the cross-company count is read through `platformRead` (purpose `helpcentre.no_result_searches`) |
| YX11ReviewLive · Article · another staff member publishes it (C-8) | live | `POST platform/help-centre/articles/:id/review`: the knowledge base's four-eyes rule (never the writer) |
| YX11RetireLive · Article · retire waiting for you to approve (1203) | live | 1203: `POST platform/help-centre/articles/:id/retire`, then `…/retire/approve` by another staff member (`help_article_retirements`) |
| YX11RetireMineLive · Article · your retire request, withdraw it (1263) | live | 1263: `POST platform/help-centre/articles/:id/retire/withdraw`, only by the person who asked, while it waits; audited; a withdrawn request can never be approved |
| YX11Edit · Article editor | live | same page, the editor drawer: `POST|PATCH platform/help-centre/articles`, `.../submit`; the H-1 pages link |

#### YX-12 · Nudge and switch-on copy editor

| story (sub-page) | verdict | note |
|---|---|---|
| YX12Nudges · Trial nudges | design only, feature not built | no trial nudges (the `Nudge` table is the manager's nudge to an employee) |
| YX12SelfApprove · Switch-on copy · approver is author | design only, feature not built | as above |

#### YX-13 · Sales-assist queue

| story (sub-page) | verdict | note |
|---|---|---|
| YX13 · Sales-assist queue | design only, feature not built | no queue. `Lead` stores landing-page sign-ups; staff cannot list them |
| YX13Empty · Sales-assist queue · empty | design only, feature not built | as above |

## 5. What can be reused, and what is missing

Reuse (never a second version):

- **The console itself**: `ConsoleShell` and `CONSOLE_LINKS` (new pages are new links), `ConsolePage` (loading, error
  and no-access states), `useConsole` / `useConsoleWrite` / `useConsoleKeys` / `loadState` (`apps/web/lib/yx-console.ts`).
- **Security**: `PlatformStaffGuard`, `platform.*` keys, `@RequireStepUp`, `platformRead` (audited cross-company read),
  `AuditService.recordIn`, support sessions.
- **Rules**: `StatutoryRulesService` (list, draft, publish), `checkShape` and `runGolden` (`statutory/evaluator.ts`), the
  arrears proposals for past-dated rules.
- **Customers**: `CompaniesScreen` and `CompanyScreen` (keep these; see question 1045), the per-ticket health score,
  company lifecycle (suspend signs everyone out), products per company and prices.
- **Not found references**: `not_found_refs` and `NOT_FOUND_CODE` (`help/not-found-ref.ts`).
- **Help articles**: the Service Desk knowledge base and its content-gap report.
- **Costs**: AI credit usage, API usage, SMS deliveries.

Second versions to retire when building (keep the live one):

| drawn here | already live | keep |
|---|---|---|
| `TenantsListScreen` (YX-04) | `CompaniesScreen` | `CompaniesScreen`, with any drawn columns it lacks added |
| `TenantDetailScreen` (YX-04) incl. its support-access part | `CompanyScreen` | `CompanyScreen`, with the money parts added in the money slices |
| `AiGovernanceScreen` (two components with one name) | neither live | rename one before either is built |

Missing (to build): a golden-case dry run and review states; a tenant-impact count; tenant health list, alerts and the
admin message; feature flags and kill switch; contain and lift; the cross-company reference look-up; maintenance windows;
partners; export billing, regions, e-invoice log, cost per tenant; AI registry; product analytics; incidents and probes;
the help-centre editor; trial nudges; the sales-assist queue.

## 6. Questions for the founder (before building)

1041. **Rule-set editor first.** *Suggested: wire the drawn YX-01 to YX-03 screens to the rule store that already exists.
      A staff member with the "Statutory rules" key drafts, and a different staff member publishes with their security
      key, as built.*
1042. **Review states.** The drawing has "In review" and "Changes requested"; the store has only draft and published.
      *Suggested: add "Send for review" and "Ask for changes" (with a note the drafter reads). Publishing stays with a
      second person.*
1043. **Try the golden cases before publishing.** *Suggested: add "Run golden cases" on a draft so the drafter sees what
      fails before asking for review. Publishing still runs them again.*
1044. **Tenant impact.** *Suggested: before publishing, show how many companies and employees the change touches
      (numbers only, never names), read through the audited cross-company read.*
1045. **Tenants drawn twice.** *Suggested: keep the live Companies pages as the one version and retire the drawn Tenants
      list and Tenant detail. Add the drawn money facts (billed employees, monthly revenue, dunning, credit notes) to
      the live company page when the money slices are built.*
1046. **Support access areas.** The drawing lets staff pick areas; live gives a fixed set of HR pages. *Suggested: keep
      the fixed set, as built (simpler and safer). Revisit only if support often needs less.*
1047. **Tenant health and churn alerts.** *Suggested: one list of companies by health, built from the score the Support
      desk already uses (admin sign-ins, open tickets, ratings, billing). Platform settings with defaults: alert below
      50, no admin sign-in for 30 days.*
1048. **Messages to company admins.** *Suggested: staff can write to a company's System Admins (email and bell). A
      message to more than one company needs a second staff member to approve it. Every message is audited.*
1049. **Feature flags and kill switch.** *Suggested: a flag per feature, with a default for everyone and an override per
      company. The kill switch turns a feature off for all at once; it needs the security key and a reason, and turning
      it back on needs a second person. Audited.*
1050. **Contain a company (YX-18).** *Suggested: build it as drawn: sign everyone out, revoke API keys and connected apps,
      hold exports, bank-detail changes and payouts, and show the company a banner. It needs the security key and a
      reason. Lifting needs two different staff members. The breach reminders (CERT-In 6 hours, DPDP Act) are platform
      settings with those defaults.*
1051. **Look up a "Not found" reference across companies (answer 975).** *Suggested: in Console › Support desk, "Look up
      a reference": staff type the NF code and see the company, when and the page, never the record. It needs the
      Support desk key and is written to the audit log.*
1052. **The support-session look-up does not work today.** Answer 975 says staff can look a reference up inside a support
      session, but the session cannot open the Help or Helpdesk pages. *Suggested: allow the reference look-up (read
      only) in a support session, as 975 intended, and add a test for it.*
1053. **H-7 in the console.** *Suggested: Console › Companies › New company becomes the company wizard (PLT-09). The
      company page shows which products and features are switched on. Maintenance windows come from YX-10 (a banner
      a day before, as answer 948). Build these together as slice C-5.*
1054. **Partners (YX-06 to YX-08).** *Suggested: build only once the partner programme is agreed. When built, staff
      check a CA's ICAI number by hand. Commission rate is a platform setting with a default, changeable per partner.*
1055. **Money (YX-14 to YX-17).** *Suggested: after partners. Export invoices under a LUT, with a warning when no LUT is
      valid; the e-invoice log through a GST e-invoice provider; the region list read from the country packs; cost per
      company from AI credits, SMS and API use. Payment terms and alert levels are platform settings with defaults.*
1056. **AI governance (YX-05).** *Suggested: later, when YukthiX runs more than the drafting assistant. A new AI model then
      needs a second staff member's approval (platform policy).*
1057. **The rest (YX-09 to YX-13).** *Suggested order: help-centre editor (YukthiX writes the starter articles companies
      get, answer 942), incidents and status page, trial nudges, sales-assist queue, product analytics.*
1058. **Who gets which console key.** *Suggested: staff roles Support agent, Customer success, Rules editor, Finance and
      Security lead. Nobody gets every key by default, and the console lists who holds what.*
1059. **The design check misses the staff console.** The automatic check that every drawn screen is live does not look at
      `/staff`, so it lists the 9 live console screens as "not live". *Suggested: let it look at the staff pages too.*
1060. **Old platform pages.** The older `/v2` platform pages (Organizations, Plans, Platform admins, All users) still
      exist and use older APIs without the console's staff check. *Suggested: check that they cannot be used without the
      security key, then retire them once the console covers them.*

## 7. Build plan (slices, max 3 builders at once)

| slice | what | reuses | size | rough estimate |
|---|---|---|---|---|
| C-1 | Rules engine: wire YX-01 to YX-03; add review states, a golden-case dry run and the impact count (1041 to 1044) | statutory rule store, evaluator, arrears proposals | M | 5 days |
| C-2 | Customers: retire the drawn Tenants pages (1045); tenant health list, churn alerts, admin message composer (1047, 1048) | `CompaniesScreen`, ticket health score, notifications, email | M | 5 days |
| C-3 | Support: cross-company reference look-up in the Support desk (1051); fix the support-session look-up (1052); the design check covers `/staff` (1059) | `not_found_refs`, `platformRead`, Support desk | S | 2 days |
| C-4 | Contain tenant (YX-18) and feature flags with kill switch (YX-04 Flags) (1049, 1050) | lifecycle suspend, `revokeStaffSessions`, step-up, `PageBanner` | L | 7 days |
| C-5 | H-7 console part: company wizard from New company, module switches on the company page, maintenance windows (YX-10 Maintenance) (1053) | PLT-09 design, products per company, `PageBanner` | M | 5 days |
| C-6 | Partners: verification, commissions, directory (YX-06 to YX-08) (1054) | console kit, audit | L | 10 days (2 builders) |
| C-7 | Money: export invoices and LUT, region catalogue, e-invoice log, cost per tenant (YX-14 to YX-17) (1055) | billing, country packs, AI credit usage | L | 10 days (3 builders) |
| C-8 | The rest: help-centre editor (YX-11), incidents and probes (rest of YX-10), trial nudges (YX-12), sales-assist (YX-13), product analytics (YX-09), AI governance (YX-05) (1056, 1057) | KB, leads, AI invocation | L | 3 weeks (3 builders) |

Order (at most three builders at once):

1. Wave 1: C-1, C-2 and C-3 together.
2. Wave 2: C-4 and C-5. C-5 unblocks Help H-7.
3. Wave 3: C-6 (two builders).
4. Wave 4: C-7 (three builders).
5. Wave 5: C-8 (three builders).

Every slice draws any new state first, keeps RLS and the staff guard, audits every write, asks for the security key on
risky actions, and adds positive and negative tests and an e2e suite.

## C-8 part 1 built: help-centre editor (YX-11, answer 1057; 12 Nov 2026, branch `feat/yukthix-console-c8`)

- **What staff do:** Console › Catalogue › Help centre (`/staff/help-centre`), the designed `HelpEditorScreen` with
  `live`. Staff write a help article (title, pages it explains, summary, the rich-text body) and send it for review; a
  different staff member publishes it or sends it back with a note. Toasts say each step is done.
- **Reused, not rebuilt:** the articles are ordinary knowledge-base articles of the YukthiX (platform) company, in its
  public space "YukthiX help" (slug `yukthix-help`, made on first use). The knowledge base's own rules apply: the H-1
  pages link, versions, and four eyes (the writer can never publish; service check). Staff act as the YukthiX-company
  user linked to them (`sd_console_agents`, the Support desk link); a staff member with no link is told to ask the
  support lead. No new table; migration `202617z0000071_console_helpcentre` only adds the key.
- **What companies see:** Help › This page (`GET /desk/my/kb/page`) lists the company's own articles for the page
  first, then YukthiX's, up to 6. A page the company explains itself shows only the company's article (its own wins).
  A YukthiX article is marked "From YukthiX" and opens on the public help centre (`/yx/help/<platform slug>/yukthix-help/<slug>`).
  Platform data: every company reads it through this endpoint; only staff write it; RLS keeps the platform company's
  rows out of every company's own reads and writes.
- **Searches with no result:** counts only (the term, how many companies, how many searches), never a company or a
  person, and only for terms at least 5 companies searched in the last 30 days. Both are platform settings with
  defaults (`helpcentre.gaps_min_companies` 5, never under 5; `helpcentre.gaps_days` 30, 7 to 180); saves are audited
  (`platform.helpcentre.settings_changed`). The read across companies goes through `platformRead`, audited with purpose
  `helpcentre.no_result_searches`.
- **Key and role (1058):** `platform.helpcentre.write` (every route; staff only, never assignable to a company role).
  Role to hold it: **Support agent** (writes and publishes; four eyes still needs two people).
- **Tests:** API unit (guards, key on every route, not assignable, the 5-company floor); kit (list and counts, new
  article field errors, writer cannot publish, send back needs a note, settings); web (the page loads and opens an
  article, no-access state; the Help drawer opens a YukthiX article on the help centre); e2e `console-helpcentre`
  (16: company admin, no sign-in, staff without the security key, without the key, not linked all refused; bad pages;
  A writes, A cannot publish, B publishes, audited; both companies see it with its address; the company's own article
  wins; RLS; a term searched by 5 companies shows as counts, by 4 is hidden; the read is audited; the floor of 5).

### Questions from C-8 (from 1201)

1201. **Public or signed-in only.** YukthiX help articles live in a public space, so the help-centre link works without
      signing in (good for search engines and for people who cannot sign in). *Suggested: keep public; nothing in them
      is company data.*
1202. **Languages.** Platform articles are English only for now; the company drawer shows a company translation when it
      has one, but YukthiX articles have no translations yet. *Suggested: add Hindi when the first translator is in
      place, through the same knowledge-base translations.*
1203. **Retiring an article.** The console can write, review and publish; retiring a published YukthiX article is not
      drawn on YX-11. *Suggested: add a Retire action in the editor drawer (four eyes as for publishing).*

## C-8 part 2 built: incidents and breach reminders (YX-10, answer 1124; 12 Nov 2026, branch `feat/yukthix-console-c8`)

- **What staff do:** Console › Operations › Incidents (`/staff/incidents`), the designed `IncidentComposerScreen` with
  `liveIncidents`. Declare incident: title, severity (Sev-1 to 3), affected products, and the first update (stage,
  impact in plain words, what companies should do, next update in 30 minutes to 4 hours), with a preview of the banner.
  Every update waits until a second staff member (never the writer; service check and a database check) approves it or
  sends it back with a note. One update waits at a time. An approved "resolved" update resolves the incident. All
  audited (`platform.incident.*`).
- **What companies see:** the C-5 endpoint and banner, no second banner. `GET /availability` now returns `incident`
  next to `maintenance`: the latest approved update of the most severe open incident on one of the company's products
  (`organization_products`), shown by `AvailabilityBanner kind="degraded"` at the top of every page (Sev-1 as an alert).
  A company without an affected product sees nothing. It never blocks sign-in or a page.
- **Breach reminders (answer 1124):** in the incident, "Mark as security breach" links it to an open containment (C-4).
  The incident then shows the containment's CERT-In and DPDP due times (set from `breach.certin_hours` and
  `breach.dpdp_board_report_hours` when contained) and is never shown to companies. A sweep every 5 minutes
  (`incident-breach-reminders`) emails every staff member holding the incidents key once per clock,
  `incident.breach_reminder_lead_hours` before each due time (platform setting, default 1, 0 to 24; 0 = at the due
  time); each reminder is marked and audited.
- **Data:** `platform_incidents`, `platform_incident_updates` (migration `202617z0000072_console_incidents`): staff-only
  (super-admin RLS policy; the breach link names a company), never deleted; companies get only the banner fields through
  the service.
- **Key and role (1058):** `platform.incidents.manage` (every route; staff only, never assignable to a company role).
  Role to hold it: **Security lead** (and whoever is on call; the reminders go to everyone holding it).
- **Not built:** probes (no probe data in the API; question 1204); regions (India only, as the wizard; 1205). The
  payroll-day note is built (answer 1206).
- **Tests:** API unit (guards, key on every route, not assignable, references, the reminder times at their boundaries,
  each once, lead 0, a late link); kit (list, what companies see, never a breach or an unapproved update, the most
  severe first, declare field errors, writer cannot approve, send back needs a note, breach needs the company and shows
  both clocks, the lead rule; the banner as alert and status); web (the page loads, no-access state); e2e
  `console-incidents` (15: company admin, no sign-in, no security key, no key refused; bad input; nothing until
  approved; the writer cannot approve; note needed; one waiting update; only the company with the product sees it, with
  banner fields only; audited; resolved hides it and closes it; RLS; containment offered; a breach is hidden from
  companies; lead setting; CERT-In reminder 1 hour before, once, to staff only; DPDP reminder; audited). C-5's
  `console-wizard-maintenance` updated for the new `incident` field and passes.

### Questions from C-8 part 2 (from 1204)

1204. **Probes.** The drawn Probes page needs synthetic checks running every 5 minutes per region and confirmed from two
      places; the API has no such data, so it is not built. *Suggested: decide the monitoring tool first (for example an
      uptime service with an API); then the page reads its results.*
1205. **Regions.** The drawing picks regions per incident; YukthiX runs in India only, so incidents pick products only.
      *Suggested: add regions when a second region exists.*
1206. **The payroll-day note.** The drawing has a checkbox "Add the payroll-day note (last 3 and first 7 days of the
      month)" without its words. *Suggested: give the sentence; it is then added to the banner when ticked.*
      **Answered 12 Nov 2026:** the sentence is "Payroll is not affected: pay runs, payslips and bank files continue as
      normal." Built: staff tick it on an update (staff routes only; migration `202617z0000073_incident_payroll_note`
      adds `payroll_note`); the company banner adds the sentence word for word (`PAYROLL_DAY_NOTE` in the kit).
1207. **Telling the breached company.** A breach incident is hidden from every company, including the contained one;
      its admins are told by the containment and directly. *Suggested: keep; a message to that company's admins goes
      through the C-2 admin messages.*

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every story of
every `Screens/YukthiX console/` file has exactly one row, in file order, under the heading that is its title after the
prefix, with one of the five verdicts. Adapted from `help-onboarding-design-map.md`; only the files and the grouping
differ.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/console-design-map.md and checks that every
// story under Screens/YukthiX console/ has exactly one row, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const path = require('path');
const PREFIX = 'Screens/YukthiX console/';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const want = {};
for (const f of walk('packages/yx-ui/src').filter((f) => f.endsWith('.stories.tsx'))) {
  const src = fs.readFileSync(f, 'utf8');
  const t = /title:\s*'([^']+)'/.exec(src)?.[1];
  // Capital first letter only: lower-case exports would be sample props.
  if (t?.startsWith(PREFIX)) want[t.slice(PREFIX.length)] = [...src.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/console-design-map.md', 'utf8');
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
counts['All A-F'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```

## Founder approved (11 Nov 2026, "ok for all")
1041 to 1060 approved as suggested. Build C-1 (rules engine), C-2 (customer health, alerts, admin messages) and C-3
(cross-company reference look-up, support-session look-up, design-check for /staff pages) now; then C-4 and C-5; then
C-6 to C-8.

## C-3 as built (answers 1051, 1052, 1059; branch `feat/yukthix-console-c3`)

- **1051:** Console › Support desk has "Look up a reference". Staff type an NF code (checked: `NF-` and 6 letters or
  digits, else 400) and see every company that has it, each with the time and the page address; never who saw it and
  never the record. Route `GET platform/support-desk/references/:code`, behind PlatformStaffGuard (security key) and the
  Support desk key `platform.support_desk.work` (the "Support agent" key of 1058). The read across companies goes only
  through `platformRead`, which writes `platform.cross_tenant_read` with the purpose "support desk: look up Not found
  reference NF-…". An unknown code returns an empty list ("No company has this reference."). At most 20 matches.
- **1052:** inside a company support session, only `GET /help/not-found/:code` is added to what the session may read
  (`SUPPORT_READABLE_ROUTES`); What's new, tours, the set-up hub and every write under /help stay refused.
- **1059:** the design-live guard now also reads `apps/web/app/staff`; the 9 console screens left its not-live list
  (the change from `fix/design-guard-staff`, commit 1417ce1f2, taken over as is).
- **Tests:** e2e `console-c3` (6: two companies with one code, audit row, empty and bad codes, company admin, company
  user and no sign-in refused, the session look-up and refused /help routes); kit support desk and look-up tests; web
  staff page test; endpoint permission spec.

### Questions (from 1101)

1101. **How many matches.** *Suggested: show at most 20 companies for one code, newest first, as built; a code is 6
      characters from 32, so two companies sharing one is rare.*
1102. **Who saw it, for staff.** *Suggested: staff see the company, time and page only, as built; who saw it stays with
      the company's own Helpdesk look-up (inside a support session staff see it there).*
1103. **A Support agent key of its own.** *Suggested: keep `platform.support_desk.work` as the Support agent key; give
      it its own name when the staff roles of 1058 are built.*

- 1101 to 1103 (C-3) approved as suggested (12 Nov 2026, "ok for all"): at most 20 companies newest first; staff never see who saw the page; keep platform.support_desk.work as the Support agent key until the staff roles (1058).
## C-2 built: customers (answers 1045, 1047, 1048, 1058; 12 Nov 2026, branch `feat/yukthix-console-c2`)

- **1045, one version:** the YX-04 Tenants list, Tenant detail and support-access stories draw the live `CompaniesScreen`
  and `CompanyScreen`; the drawn `TenantsListScreen` and `TenantDetailScreen` are deleted.
- **1047, tenant health and churn alerts:** Console › Customers › Customer success (`/staff/customers`) is the designed
  `CustomerSuccessScreen` with `live`. One health score (`apps/api/src/service-desk/tenant-health.ts`), now shared by the
  Support desk's company panel and this list: 80, less billing or account not in good standing (30), no admin sign-in
  for 30 days (20), more than 3 open tickets (10), ratings under 3.5 (15), negative NPS (15). Read through the audited
  `platformRead` (purpose `customer_success.health`); account facts only. Alerts: platform settings with defaults
  (`platform_settings`, staff-only RLS): `cs.alert.health_below` 50 (1-99) and `cs.alert.admin_idle_days` 30 (7-365),
  changed on the Alerts tab (audited before and after).
- **1048, messages to company admins:** subject and plain-text message to the System Admins of one or more open
  companies. One company: sent at once. More than one: waits until another staff member approves it (never the writer:
  service check and a database check; approving is step-up, version-checked) or sends it back with a reason. Sent: each
  company's own copy (`company_messages`, forced RLS) on Settings › Support access › Messages from YukthiX, its System
  Admins' bell and email (`notifySystem`: their email choice and digest), and a `yukthix.message.received` row in the
  company's audit log; the platform log has written, sent and sent back. Re-sending is safe (a company never gets it twice).
- **1058:** a new staff key `platform.customers.success` (never in a company role). Until staff roles exist the one staff
  role holds it, like every console key (question 1086).
- **Routes:** `GET platform/customers/health`, `GET|PUT platform/customers/settings`, `GET|POST platform/customers/messages`,
  `POST platform/customers/messages/:id/approve` (step-up), `POST .../:id/reject`: JwtAuthGuard, PlatformStaffGuard
  (staff, security key), PermissionsGuard (`platform.customers.success`). Company: `GET support-access/messages`
  (`org.support_access.approve`).
- **Migration** `202617z0000051_console_customers`: `platform_settings`, `yukthix_messages` (staff only; no delete),
  `company_messages` (forced RLS; no update), the key.
- **Tests:** API unit (guards, every route's key, step-up on approve, key never assignable, alert boundaries and settings,
  the shared score); kit (list and alerts, composer errors, one company Send and two Send for approval, the writer cannot
  approve, send back needs a reason, alert rules range and save, read-only without the key, retry, the company's
  messages card, the YX-04 stories render the live Companies screens); e2e `console-customers` (refused for no sign-in,
  a company admin, staff without the security key and the key withdrawn; the audited read; alerts follow the settings;
  bad input; one company delivered to its copy, bell, email and audit log only; two companies wait, writer refused,
  step-up, stale version, delivered to both and not the third; send back; RLS keeps staff tables from companies and the
  writer can never be the approver). Manual tests MT-CON-1047 and MT-CON-1048.

## Founder questions from C-2 (12 Nov 2026)

1081. **HR and Payroll Admins.** The drawing sends to System, HR and Payroll Admins and billing contacts; built: System
      Admins only (answer 1048). *Suggested: keep System Admins only for now; add the others if customers ask.*
1082. **The drawn columns not built.** 30-day change needs a nightly score history; churn band and CS owner need staff
      roles. *Suggested: add a nightly score snapshot with the staff roles slice, then the 30-day change and owner.*
1083. **Alert follow-up.** The drawing has an owner, a status and Log outreach per alert; built: alerts as a live list.
      *Suggested: build follow-up with the staff roles slice, so each alert has a Customer success owner.*
1084. **Message kind, channel and date.** The drawing has a kind, a channel (banner, inbox, email), a send-on date and a
      limit of 2 non-critical messages a week. Built: bell and email, sent now. *Suggested: add the 2-a-week limit as a
      platform setting with that default, and scheduled sending, when staff send regular messages.*
1085. **Who approves.** The drawing names the second approver; built: any other staff member with the Customer success
      key approves. *Suggested: keep (no waiting on one named person).*
1086. **Everyone holds every console key.** Until staff roles exist (answer 1058), every staff account has the Customer
      success key. *Suggested: build staff roles next in the console waves.*
1087. **Withdrawing your own message.** A writer cannot pull back a message waiting for approval; another staff member
      sends it back. *Suggested: let the writer withdraw it, audited.*

- 1081 to 1087 (C-2) approved as suggested (12 Nov 2026, "ok for all"): System Admins only; 30-day change, churn band and CS owner with staff roles; alert follow-up with staff roles; weekly limit and scheduling later as a platform setting; any other staff member with the key approves; staff roles slice next after C-5; the writer may withdraw a pending message, audited (to build).
## C-1 built: the rules engine (answers 1041 to 1044, 1058; 12 Nov 2026, branch `feat/yukthix-console-c1`)
- **Pages** (`/staff/rules`, Console › Rules › Rule sets): the list (YX-01), one version (YX-01 editor), Golden cases
  and review (YX-02, `/staff/rules/golden`) and Publish (YX-03, `/staff/rules/publish`), all the drawn screens with a
  `live` prop. New C-1 states were drawn first in the same story files.
- **Review (1042).** The drafter sends a draft for review ("in review"). A second member of staff publishes it or asks
  for changes with a note (10 to 500 characters): it goes back to draft, shown as "Changes requested" with the note, and
  only its drafter changes it and sends it again. Only a version in review is published (also the pack loader). The
  drafter can neither ask for changes on nor publish their own (screen, API and database).
- **Publishing (1041)** needs the security key again (step-up); the drafter never publishes.
- **Dry run (1043).** "Run all cases" runs the shape checks and every golden case on a version and returns each case's
  expected and actual result; it saves nothing but the audit row `platform.statutory.golden_run`.
- **Impact (1044).** Companies and employees working in the rule's jurisdiction today (current assignments at locations
  in that country or state; closed companies left out), and the same by company size. Numbers only: no company or
  person, no id. It is read through `platformRead`, audited as `platform.cross_tenant_read` with its purpose
  (`statutory.impact <statute> <jurisdiction> <version>`).
- **Key (1058).** The existing `platform.statutory.manage` is the "Rules editor" key (renamed in its description). Every
  route: `JwtAuthGuard`, `PlatformStaffGuard`, `PermissionsGuard` with that key. No new use of the RLS bypass: the rule
  store writes stay in their SECURITY DEFINER functions (new: `statutory_update_draft`, `statutory_send_for_review`,
  `statutory_request_changes`; `statutory_publish` now needs "in review"); the cross-company count is `platformRead`.
- **Audit:** drafted, draft changed, sent for review, changes requested (with the note), golden run, published; each names
  the member of staff.
- **Migration** `202617z0000061_console_c1_rules` (change note and review columns, the three functions).
- **Design-live guard:** the guard now also reads the staff console (`apps/web/app/staff`, answer 1059, shared with
  C-3): YX-01 to YX-03 and the 9 live console screens left the not-live list (12 fewer).
- **Tests:** API unit (routes and keys, only publish steps up, states, places, sizes), e2e `console-c1-rules` (8: refusals
  for no session, a company user, a company admin and staff without their security key; the drafter cannot publish or
  review; publishing a draft not in review is refused; changes requested goes back to draft with the note; step-up;
  the dry run changes nothing; the impact is numbers only and audited), kit `console-rules-live.test.tsx` (10), web
  `console-rules.test.tsx` (5). `payroll-5b` now sends for review before publishing.

### Questions from C-1 (from 1061)
1061. **Who holds the Rules editor key.** Every YukthiX staff account holds every console key today (the staff role
      grants them all), so "staff without the key" cannot happen yet. *Suggested: build the staff roles of answer 1058
      (Support agent, Customer success, Rules editor, Finance, Security lead) in a small slice, so only rules editors
      draft and publish.*
1062. **The source as a file.** The drawing uploads the gazette notification; the store keeps a source text (the
      notification and its link). *Suggested: keep the text now; store the PDF with the version when the document
      store is used for platform files.*
1063. **Rules other than PT slabs.** Only PT slabs have the drawn grid; every other kind (PF, ESI, TDS, minimum wages and
      the rest) is edited as data (JSON) with the shape checks on save. *Suggested: keep; draw a form per kind when a
      kind is changed often.*
1064. **Impact numbers from pay.** "Employees whose PT changes" and "arrears proposals" need payroll data, which staff
      never read (the pay guard). *Suggested: leave them out; the companies see their own arrears proposals.*
1065. **Notices to companies.** The drawn Notices step (email and in-app notice to payroll and HR admins, a reminder, a
      banner) is not built. *Suggested: build it with the admin messages of C-2 (answer 1048), using its composer.*
1066. **Copying across countries.** A copy keeps the statute and jurisdiction; the draft API takes Indian statutes only
      (`IN.…`, `IN` or `IN-XX`), so UAE, GST and hiring rules cannot be drafted in the console yet. *Suggested: allow
      the other packs' statutes when someone needs to change one.*

## C-4 as built (answers 1049, 1050; branch `feat/yukthix-console-c4`)

- **1049 feature switches** (`feature_flags`, `feature_flag_overrides`; forced RLS: every company reads the switches and
  only its own overrides; only staff write). The one place: `featureOn(tx, company, key)` = not killed, then the
  company's own value or the default, then the company's own setting. The four first switches are features that already
  exist as company settings: First-run tours (`help.tours.show`), What's new (`help.whats_new.show`), Access requests
  (`access.request.allowed`), Write policies with AI (`policy.ai_writer`); their services now ask `featureOn`, and the
  screens follow the API's answers. Console › Feature flags: default on/off, a company's own value, the kill switch;
  every change needs a reason and the security key again; a killed feature is turned back on only by another staff
  member. Audited (`platform.flag.*`; a company's own value also in the company's log).
- **1050 contain a company** (`company_containments`, one open per company; the company reads its own, only staff
  write; two different people to lift, also a database check). Containing ends every session and refresh token and any
  support session, revokes connected apps (webhooks to other systems off, automation webhooks off, work-tool connections
  revoked, calendar tokens removed), and starts the breach clock from the platform settings `breach.certin_hours` (6) and
  `breach.dpdp_board_report_hours` (72, marked verify; the DPDP Rules 2025 wording as in APX-G: the Board and the people
  affected told without delay, the detailed report to the Board within 72 hours). While contained the API refuses with
  423 `COMPANY_CONTAINED`: exports (every export route), payouts (making or releasing bank files and payout batches,
  payout files, EWA draws marked paid), bank-detail changes (change requests and their approval, the joiner's bank
  section). The company's app shows the banner on every page. Audited in the platform log and the company's log.
- **Tests:** e2e `console-c4` (9: refusals, override beats default both ways, kill switch and second person, sessions
  end, apps revoked, the three holds refused with the message, other company untouched, RLS, two-person lift); hold
  route unit tests (20); kit live screens (5); web staff pages (2); help-h2, help-whats-new, help-tours and
  platform-console e2e rerun.

### Questions (from 1121)

1121. **One legal entity.** The drawing offers containing one legal entity. *Suggested: whole company only, as built; one
      entity needs the holds per entity and can come when a group of companies asks.*
1122. **Force MFA after containment.** The drawing says everyone signs in again with MFA. *Suggested: not built; turning MFA
      on for every employee (including shop-floor staff without a phone) is a company decision. Everyone is signed out.*
1123. **API keys and partner grants.** YukthiX has no company API keys or partner grants yet. *Suggested: revoke them in
      the same step when those features exist.*
1124. **The DPDP timing.** *Suggested: keep 72 hours for the detailed Board report (verify with counsel), and add a
      reminder at the CERT-In and DPDP due times when the incident tooling (YX-10) is built.*
1125. **Editing the platform settings.** *Suggested: the two breach settings are changed by a migration for now; a
      Console › Platform settings page comes with the next platform setting.*
1126. **Each staff member's own keys.** Today every YukthiX staff account holds every console key, so "without the key"
      means without the security key. *Suggested: give out the contain and flags keys by staff role with 1058.*
## C-5 built: company wizard, products and features, planned maintenance (answers 948, 1053; 12 Nov 2026, branch `feat/yukthix-console-c5`)

- **Company wizard (PLT-09):** Console › Companies › New company opens `/staff/companies/new`, the designed
  `TenantWizardScreen` with `live`: company details (name, company code), the default legal entity (registered name,
  PAN and GSTIN optional; the GSTIN must carry the PAN), the first System Admin, plan and products (with today's price),
  review, then Create company. The old New company drawer is deleted (one version). The existing create API
  (`POST platform/companies`) now takes the legal entity basics, needs a fresh step-up (security key) and is audited
  (`platform.company.created` with the entity, PAN and GSTIN given or not). The first System Admin gets one email, the
  invite to set their password, and nothing else. Done: the System Admin finishes set-up in Settings › Set-up hub (H-6).
- **Products and features on the company page:** a "Products and features" card: every plan product (on, or Not in the
  plan) and each plan feature YukthiX switches on (Company settings: on, off, or Not in the plan). C-4's per-company
  feature switches are not merged; they join this card as source `switch` (hook in `companies/[id]/page.tsx`).
- **Planned maintenance (YX-10, answer 948):** Console › Operations › Planned maintenance (`/staff/maintenance`), the
  designed `IncidentComposerScreen` with `live` (its maintenance part; incidents are not built). Staff schedule a window
  (title, day, start, 1 to 4 hours); the drawn checks come from platform settings with defaults: 72 hours' notice,
  banner 24 hours before, at most 4 hours, never in the first 7 or last 3 days of the month (India days) nor on the
  statutory dates 7, 15, 20. A second staff member (never the scheduler; service and database check) approves it;
  anyone may cancel it with a reason; no overlaps; all audited. `maintenance_windows` (migration
  `202617z0000061_console_maintenance`): platform data every session reads, only staff write, never deleted.
- **What companies see:** one endpoint, `GET /availability` (every signed-in person): the 6.5 `AvailabilityBanner` (live)
  from the banner time until the window ends, at the top of every page. It never blocks sign-in or a page by itself.
- **Not built:** sample data (answer 950); go-live sign-off (1011: the drawing does not put it in the wizard; question
  1142); the drawn wizard's company-side steps (locations, departments, grades, import; question 1141).
- **Tests:** API unit (routes, keys, step-up on create, the rules at their boundaries and from settings, before and
  during); kit (wizard input and steps, focus, review and create, refusal kept on screen; maintenance checks, send,
  writer cannot approve, cancel needs a reason, rules; banner before and during; products and features); web (New
  company opens the wizard, the wizard creates and opens the company, maintenance loads); e2e
  `console-wizard-maintenance` (refused for a company admin, staff without the security key, without the companies or
  maintenance key, without a fresh step-up; bad email, bad PAN, GSTIN without the PAN, taken code; the entity and one
  invite only; audit; maintenance rules; second staff member; companies see nothing until approved, the same banner
  for every company with no company data, nothing outside the banner time; sign-in works during a window; cancel;
  RLS). Manual tests MT-CON-1053a and MT-CON-1053b.

## Founder questions from C-5 (12 Nov 2026)

1141. **The drawn wizard's other steps.** PLT-09 also draws locations, departments, grades and an employee import. The
      console wizard stops after the first System Admin and products; the company does the rest in its own set-up pages
      (the set-up hub lists them). *Suggested: keep it so; staff never type a company's people data.*
1142. **Go-live and sign-off (1011).** The drawing does not put go-live in the wizard, so none was added; the hub stays a
      progress view. *Suggested: add a go-live date on the company page when billing starts (trial to paid).*
1143. **"Down for maintenance" pages.** The drawn 6.5 page state blocks a feature during maintenance; a window is not an
      outage switch, so only the banner is shown. *Suggested: keep the banner only; blocking a page is an incident
      decision for YX-10 incidents later.*
1144. **Maintenance by product.** A window applies to every company. *Suggested: add products to a window (only those
      companies see it) when a change touches one product only.*
1145. **Approving maintenance needs the security key?** Approving a window does not ask for step-up (it changes no data).
      *Suggested: keep.*
1146. **Language and data region in the wizard.** The drawing shows a default language and the data region; region is
      fixed to India and language is left to the company's own settings. *Suggested: keep.*

- 1061 to 1066 (C-1) and 1121 to 1126 (C-4) approved as suggested (12 Nov 2026, "ok for all"). To do from them: staff roles (1061, 1126; in progress); notices to companies on a rule change through the C-2 admin messages (1065); a Console › Platform settings page with the next platform setting (1125); confirm the DPDP 72-hour Board report timing with counsel (1124, founder).

- 1141 to 1146 (C-5) and 1161 to 1166 (staff roles) approved as suggested (12 Nov 2026, "ok for all"). To do from them: keep two Security leads and take the role from the rest (1162, staff action after merge); Add staff and Deactivate in Staff and roles, then retire the old /v2 Platform admins page (1164); nightly health snapshot, 30-day change, CS owner and alert follow-up (1165); every staff member sees their own roles on My security (1166); a go-live date on the company page when billing starts (1142).

## Staff roles built (answers 1058, 1061, 1086; 12 Nov 2026, branch `feat/yukthix-console-staff-roles`)
- **Five roles, fixed keys** (`platform_role_keys`, changed only by a migration):
  - Support agent: see companies, work the Support desk, ask for a support session.
  - Customer success: see companies, create companies and change their lifecycle, customer health and messages, What's new.
  - Rules editor: draft, review and publish rule sets.
  - Finance: see companies, set prices.
  - Security lead: see companies, create companies and change their lifecycle, the shared SMS account, the platform
    audit log, and give and take staff roles (new key `platform.staff.manage`).
- **Nobody holds every key by default.** The staff role (`super_admin`) no longer grants any `platform.x.y` key; a member
  of staff holds the keys of their roles (`platform_staff_roles`), read in the one permission resolver
  (`packages/shared/src/rbac/permission-grants.ts`). A new staff account has no console key until a Security lead gives
  it a role. Old `platform:...` keys of the `/v2` pages are unchanged (question 1060).
- **Moving existing staff** (migration `202617z0000071_console_staff_roles`): every staff account became a Security lead,
  plus the roles its audit trail shows: Rules editor (any `platform.statutory.*`), Support agent (support sessions,
  going into a company, Support desk tickets), Customer success (messages, customer-success settings, What's new, trial
  extensions), Finance (prices). On this database: 13 Security leads, 4 Rules editors, 1 Support agent, 1 Customer
  success, 1 Finance. A fresh installation makes its first Security lead with `platform_bootstrap_security_lead` (only
  while there is none; the seed uses it).
- **Changing roles:** Console › Security › Staff and roles (`/staff/staff`, kit `StaffRolesScreen`, drawn first: 4
  stories). Only a Security lead, with the security key again and a reason; never their own (no action on your row; API
  403; database `YX_STAFF_SELF`); the last active Security lead keeps the role (screen; database
  `YX_STAFF_LAST_LEAD`; and since only another active Security lead may change roles, the last one can never lose it).
  Audited as `platform.staff.roles_changed` with before, after and the reason. The list is an audited `platformRead`.
- **Platform keys stay platform-only:** a company role, override or grant never confers a platform key (resolver), and
  the database refuses one in `permission_profiles` and `org_role_permissions`. Staff role rows are only for staff
  accounts (trigger) and only readable outside any company.
- **Web:** `CONSOLE_KEYS` includes the Support desk and Security lead keys, so buttons follow the keys held.
- **Tests:** e2e `console-staff-roles` (7), kit `staff.test.tsx` (4), web `console-staff.test.tsx` (2); the suites that
  make their own staff now give them roles (`test/fixtures/staff-roles.ts`), and `console-customers` takes the Customer
  success role away instead of the old staff-role key.

### Questions from staff roles (from 1161)
1161. **The key sets.** As above: creating companies and changing their lifecycle sit with Customer success and the
      Security lead; the shared SMS account and the audit log with the Security lead only. *Suggested: keep.*
1162. **Too many Security leads after the move.** Every existing staff account is now a Security lead so nobody was
      locked out. *Suggested: after the move, the founder keeps two Security leads and the others lose the role.*
1163. **New staff accounts.** They hold no console key until a Security lead gives a role. *Suggested: keep.*
1164. **Adding and deactivating staff.** Staff accounts are still made outside the console (the old `/v2` pages or the
      seed); a deactivated Security lead stops counting as one. *Suggested: add "Add staff" and "Deactivate" to Staff
      and roles (Security lead key), then retire the old `/v2` Platform admins page (answer 1060).*
1165. **Answers 1082 and 1083** (the nightly health snapshot, the 30-day change, the Customer success owner, and alert
      follow-up) are not in this slice. *Suggested: the next small slice, with owners chosen from the Customer success
      role.*
1166. **Seeing your own roles.** Only Security leads see who holds what. *Suggested: show every member of staff their own
      roles on My security.*

## Staff roles, second part (answers 1161 to 1166; 12 Nov 2026, branch `feat/yukthix-console-staff-roles`)
- **C-4 and C-5 keys on roles** (migration `202617z0000073_console_staff_roles_c4_c5`, after C-4 and C-5): containment
  (`platform.company.contain`) and feature switches (`platform.flags.manage`) go to the Security lead; planned
  maintenance is scheduled by the Security lead (`platform.maintenance.manage`) and seen by Customer success (new
  `platform.maintenance.view`; the maintenance screen shows the windows without its buttons). Later keys (migration
  `202617z0000074_console_staff_roles_helpcentre`): the help-centre writers' key (`platform.helpcentre.write`, C-8) to
  the Support agent, Platform settings (`platform.settings.manage`) to the Security lead; rule notices need both the
  Customer success and Rules editor keys, by design. Incidents and the status page (`platform.incidents.manage`, C-8 part 2; migration
  `202617z0000075_console_staff_roles_incidents`) to the Security lead, and breach reminders now go to the active staff
  whose roles hold that key. The keys C-4 and C-5 gave
  the staff account type are taken back. Every console key is on at least one role (checked on this database).
- **1164, Add staff and Deactivate** in Console › Security › Staff and roles: only a Security lead, with the security key
  again and a reason, audited (`platform.staff.invited`, `platform.staff.deactivated`). A new member of staff gets an
  email to set a password and adds a security key at first sign-in; they hold no console key until given a role. A
  deactivated member of staff is signed out everywhere at once. Nobody deactivates themselves, and the last active
  Security lead is never deactivated (database `platform_deactivate_staff`; only another active Security lead may act).
- **Retire `/v2` Platform admins (answer 1060):** marked for retirement. The console now adds and deactivates staff,
  so the old `/v2/(platform)` Platform admins page (invite and promote with the old `platform:manage_organizations` key)
  is no longer needed. Not deleted yet; retire it with the other `/v2` platform pages.
- **1166:** every member of staff sees "Your console roles" on My security (`/staff/security`, `GET /platform/my-roles`,
  no console key needed), with what each role lets them do; with no role it says so.
- **Tests:** e2e `console-staff-roles` (now 12: also the C-4 and C-5 keys by role, my roles, add staff, deactivate, the
  last Security lead), kit `staff.test.tsx` (8) and `auth.test.tsx` (My security roles), web `console-staff.test.tsx` (3)
  and `console-my-roles.test.tsx` (2).

### Questions from staff roles, second part (from 1171)
1171. **Bringing someone back.** A deactivated member of staff cannot be reactivated in the console; they would be
      invited again with a new email. *Suggested: add "Reactivate" (Security lead, the security key again, a reason).*
1172. **Changing roles of a deactivated account.** A Security lead can still change the roles of a deactivated account
      (it holds nothing while deactivated). *Suggested: keep (roles are ready if they come back).*
1173. **Invitation that expired.** The invitation link works once for 72 hours; there is no "send again" yet.
      *Suggested: add "Send the invitation again" for accounts that never signed in.*
1174. **Customer success and maintenance.** Customer success sees planned maintenance but cannot schedule it.
      *Suggested: keep.*


## Console follow-ups as built (answers 1065, 1087, 1125 and C-5's hook; branch `feat/yukthix-console-followups`)

- **1065 rule notices:** after publishing (Rule sets › Publish), the drawn Notices step: a subject and notice, sent with
  `POST platform/customers/rule-notices/:ruleSetId` (Customer success key and Rules editor key). It goes to the System
  Admins of every open company with a location in the rule's country (`IN`) or state (`IN-KA`), as a C-2 admin message:
  more than one company waits for a second staff member; the same audit. Only a published rule set; one live notice per
  rule set (`yukthix_messages.rule_set_id`, a database check); a withdrawn or sent-back one may be written again.
- **1087 withdrawing:** the writer withdraws their own message while it waits (`POST …/messages/:id/withdraw`, status
  `withdrawn`, audited `platform.message.withdrawn`); it can never be approved after; nobody else can withdraw it.
- **1125 Platform settings:** Console › Security › Platform settings (`/staff/platform-settings`), `PlatformSettingsScreen`,
  added to the kit first as a story (no drawn screen existed). Every value: C-2's alert rules, C-4's breach hours
  (the DPDP timing marked "Verify with counsel"), C-5's maintenance rules and statutory dates. A change needs the new
  key `platform.settings.manage`, the security key again and a reason; each value is checked against its own range
  (breach: CERT-In 1-24 hours, DPDP 1-168 hours; question 1182); audited `platform.setting.changed` with before and after.
- **C-5's hook:** the company page's Products and features card lists the C-4 switches for that company, each decided
  by the one feature check, with why it is off: Killed for everyone, Off for this company, Off by default, Off in company
  settings (`GET platform/companies/:id/feature-switches`).
- **Tests:** e2e `console-followups` (9); kit (platform settings, rule notice, withdraw); web (the card, platform
  settings); C-1, C-2, C-4 and C-5 e2e rerun.

### Questions (from 1181)

1181. **Notices to HR and Payroll Admins.** The drawing sends rule notices to Payroll and HR Admins with a reminder and a
      banner; built: the System Admins, by the C-2 messages (1081). *Suggested: keep System Admins until message
      audiences are built; then add Payroll Admins for pay rules.*
1182. **Ranges for the breach hours.** *Suggested: CERT-In 1 to 24 hours and DPDP 1 to 168 hours, as built; counsel may
      narrow them.*
1183. **Platform settings in two places.** C-2's alert rules and C-5's maintenance rules can still be changed on their own
      pages (no reason asked there). *Suggested: keep one place: those pages link to Platform settings, which asks for
      the key and a reason.*

## 1165 as built (answers 1082, 1083; branch `feat/yukthix-console-1165`)

- **Nightly health snapshot:** scheduled sweep `cs-health-snapshot` (01:30 IST): one row per company per India day in
  `cs_health_snapshots` (score and band only; a rerun the same day replaces it), the alert follow-up sync, and the purge
  of snapshots older than the platform setting `cs.snapshot.keep_days` (400 by default, 31 to 1825; also on Console ›
  Platform settings). Audited once per run (`platform.cs.snapshot_taken`).
- **The drawn columns:** 30-day change (today's score less the latest snapshot on or before 30 India days ago; "No history
  yet" without one), churn risk (from the drawn bands: healthy low, watch medium, at risk high) and CS owner.
- **Customer success owner** (`cs_accounts`): Assign owner (the drawn bulk action); only active staff holding the
  Customer success role; audited before and after.
- **Alert follow-up** (`cs_alerts`, `cs_alert_notes`): each alert opens a follow-up owned by the company's owner; Owner
  and status (open, contacted, resolved) and Log outreach (a note; an open alert becomes contacted); all audited; a
  follow-up whose alert cleared is resolved by itself (`auto_resolved`). One live follow-up per company and rule
  (database). All four tables are platform-only (forced RLS); companies never read them.
- **Tests:** e2e `console-cs-followup` (8): Support agent and company admin refused; owner must hold the role (inactive and
  Support agent refused); snapshot idempotent within a day; 30-day change from the snapshot; purge keeps 400 days and
  deletes 401; outreach audited and contacted; owner and version checks; auto-resolve; RLS. Unit: 30-day change across a
  month end and February, the India day boundary, the bands. Kit: columns, outreach note, resolved alert.

### Questions (from 1221)

1221. **Churn risk.** Built from the score's band only (healthy low, watch medium, at risk high). *Suggested: keep; add the
      30-day drop (for example 15 points or more makes it high) once a few months of history exist.*
1222. **Who can own.** Only staff holding the Customer success role; a Security lead without it cannot. *Suggested: keep.*
1223. **When an owner leaves.** A deactivated owner keeps their companies and alerts until reassigned. *Suggested: show
      "Owner left" and list those companies for reassignment.*
1224. **Alert notices.** New alerts reach their owner only in the console list. *Suggested: a daily email to each owner with
      their new alerts, later.*

- 1171 to 1174, 1181 to 1183, 1201 to 1207 and 1221 to 1224 approved as suggested (12 Nov 2026, "ok for all"). To build now: Reactivate staff (1171); send a staff invitation again (1173); Platform settings as the one place to change settings, the alert and maintenance pages link to it (1183); Retire a YukthiX help article with second-staff approval (1203); "Owner left" with a reassignment list (1223). Later: Payroll Admins on pay-rule notices (1181); Hindi help articles (1202); probes after a monitoring tool is chosen (1204); regions (1205); daily owner email of new alerts (1224); churn drop rule after a few months of history (1221). Founder to give: the payroll-day banner sentence (1206); which two staff stay Security leads (1162).

## Staff, third part (answers 1171, 1173; 13 Nov 2026, branch `feat/yukthix-console-staff-2`)
- **1171, Reactivate** (Staff and roles, on a deactivated row): only a Security lead, with the security key again and a
  reason; audited as `platform.staff.reactivated` with the roles they come back with. Never yourself; an active account
  is refused (database `platform_reactivate_staff`, migration `202617z0000091_console_staff_2`). **They come back with
  the roles they held**: answer 1172 kept roles on deactivation so a Security lead decides on purpose, and the dialog asks
  them to check the roles first. Their sessions stay ended; they sign in again and the console waits for their
  security key.
- **1173, Send the invitation again** (on an "Invited" row: active and never signed in): same guard, step-up, reason and
  audit (`platform.staff.invite_resent`). The new link retires every earlier one. At most
  `staff.invite.resends_per_day` sends a day per person (an India day; platform setting, 3 by default, 1 to 10); the
  next one is refused with 429 and when to try again. Someone who already signed in, or a deactivated account, is
  refused.
- **Tests:** e2e `console-staff-2` (6), kit `staff.test.tsx` (11), web `console-staff.test.tsx` (4).

### Questions (from 1241)
1241. **What the daily limit counts.** Only "Send the invitation again" counts; the first invitation (Add staff) does
      not. *Suggested: keep.*
1242. **Reactivating with fewer roles.** Reactivate brings back every role held; to bring someone back with less, the
      Security lead changes the roles first (allowed on a deactivated account, answer 1172). *Suggested: keep.*
1243. **Invited accounts that never come.** An invited account stays "Invited" until someone deactivates it.
      *Suggested: deactivate invited accounts automatically after 30 days without a sign-in (a platform setting).*

## Console tidy as built (answers 1183, 1203, 1223; branch `feat/yukthix-console-tidy`)

- **1183 one place for platform settings:** the direct saves are gone (`PUT platform/customers/settings` and
  `PUT platform/maintenance/settings` now answer 404). Customer success › Alert rules and Planned maintenance › Rules show
  the values (and the default) and a "Change in Platform settings" button for holders of the Platform settings key;
  Console › Platform settings changes them with the security key and a reason, audited before and after.
- **1203 retiring a YukthiX help article:** in the editor drawer, Retire (a reason) on a published article; another staff
  member approves (`help_article_retirements`, four eyes in the service and the database); the article becomes
  retired and leaves every company's Help drawer. Audited (`platform.helpcentre.retire_requested`, `…retired`, and the
  knowledge base's own `desk.kb.article_retired`).
- **1223 Owner left:** a deactivated Customer success owner shows as "Owner left" on the company and its alerts, and a list
  on Customer success › Tenant health offers Assign owner. Reassigning the company moves its open alerts the old owner
  held to the new one; both clear.
- **Tests:** e2e: `console-customers` and `console-wizard-maintenance` (old routes 404; values saved on Platform settings
  show on the alert rules and the maintenance page), `console-staff-roles`, `console-helpcentre` (retire: reason, the
  asker cannot approve, approved retires, gone from both companies' drawers, only a published article; the suite now
  makes the seed's staff account and demo company itself on a fresh database), `console-cs-followup` (Owner left after
  deactivation, the departed owner cannot be chosen, reassigning clears it and moves the alert). Kit and web tests.

### Questions (from 1261)

1261. **Two more direct saves.** The help-centre editor's no-result search settings and the incident reminder lead time
      (C-8) still save on their own pages. *Suggested: move them to Platform settings the same way.*
1262. **Who changes these settings now.** Platform settings needs the Security lead key, so a Customer success member
      can no longer change the alert rules alone. *Suggested: keep (a Security lead changes platform settings);
      Customer success asks one.*
1263. **Withdrawing a retire request.** The person who asked cannot take a retire request back; it waits until another
      member of staff approves it. *Suggested: let the asker withdraw it, audited, as for messages (1087).*
1264. **Putting a retired article back.** The knowledge base can republish a retired article; the console does not offer
      it yet. *Suggested: "Put back" with the same two-person approval when someone needs it.*

- 1241 to 1243 and 1261 to 1264 approved as suggested (12 Nov 2026, "ok for all"). To build: auto-deactivate invited staff who never sign in after 30 days, a platform setting (1243); move the help-centre search setting and the incident reminder lead time to Platform settings (1261); withdraw your own retire request, audited (1263). Later, when needed: "Put back" a retired article with two-person approval (1264).

## Console tidy 2 as built (answers 1243, 1261, 1263; branch `feat/yukthix-console-tidy-2`)

- **1261 two more settings on Platform settings:** `PUT platform/help-centre/settings` and `PUT platform/incidents/settings`
  are gone (404). The help-centre no-result search rules (`helpcentre.gaps_min_companies`, 5 to 100, default 5;
  `helpcentre.gaps_days`) and the breach reminder lead time (`incident.breach_reminder_lead_hours`, 0 to 24, default 1)
  are in the Platform settings registry. Their pages show the value (and the default) and "Change in Platform settings"
  for holders of the Platform settings key; the change needs the security key and a reason, audited before and after.
- **1263 withdrawing a retire request:** while it waits, the person who asked sees "Withdraw request" in the editor drawer
  (`POST platform/help-centre/articles/:id/retire/withdraw`). Anyone else gets 403; the request becomes `withdrawn`
  (a new status in `help_article_retirements`, migration `202617z0000102`), audited as
  `platform.helpcentre.retire_withdrawn`; a withdrawn request can never be approved (404), and the article can be asked
  again.
- **1243 invitations expire:** the nightly sweep `staff-invite-expiry` (02:15 IST) deactivates invited staff who never
  signed in, more than `staff.invite.expire_days` (Platform settings, default 30, 7 to 90) after their latest invitation
  (a resent invitation restarts the count). The database function `platform_expire_invited_staff` (migration
  `202617z0000101`, platform only) never touches anyone who has signed in, nor the last active Security lead, and a
  rerun finds nobody new. Audited by the system (no person) per account (`platform.staff.deactivated`, with the reason
  and the setting value) and once per run (`platform.staff.invites_expired`).
- **Tests:** e2e `console-helpcentre` (old route 404; minimum 5 refused on Platform settings; the value shows on the page;
  withdraw: someone else 403, the asker 200, approve after withdrawal 404, withdraw twice 404, audited),
  `console-incidents` (old route 404; 25 refused; the value shows), new `console-staff-expiry` (not at N days, yes at N+1;
  skips a signed-in account; skips the last Security lead, rolled back; 6 and 91 refused by the database; audited with
  the setting value; a rerun is safe), `console-staff-roles`, `console-staff-2`. Kit and web tests (read-only cards and
  the link only with the key; Withdraw only for the asker).

### Questions (from 1281)

1281. **Telling someone their invitation expired.** The job deactivates quietly; nobody is told. *Suggested: email the
      Security leads a daily list of accounts the job deactivated (none on quiet nights).*
1282. **A warning before it happens.** An invited person gets no reminder before the account goes. *Suggested: none for
      now; a Security lead can send the invitation again (1173) from Staff and roles, which restarts the count.*
1283. **Bringing an expired account back.** An expired invitation is an ordinary deactivated account. *Suggested: keep:
      Reactivate (1171) and then Send the invitation again, both by a Security lead.*
1284. **Seeing a withdrawn request later.** A withdrawn retire request shows only in the audit log, not on the article.
      *Suggested: keep (the audit log is enough).*

- 1281 to 1284 approved as suggested (12 Nov 2026, "ok for all"). To build: a daily email to the Security leads listing invited staff the expiry job deactivated, only when there are some (1281).
