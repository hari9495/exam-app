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

After C-2 (12 Nov 2026): the YX-04 Tenants rows are live (answer 1045), tenant health, alerts and the composer are live,
and five new stories were added (four YX-04, one company-side Support access).

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Live console | 2 | 20 | 0 | 0 | 0 | 0 | 20 |
| B. Rules engine (YX-01 to YX-03) | 3 | 0 | 0 | 12 | 3 | 0 | 15 |
| C. Customers and containment (YX-04, YX-18) | 2 | 14 | 0 | 0 | 6 | 0 | 20 |
| D. Partners (YX-06 to YX-08) | 3 | 0 | 0 | 0 | 10 | 0 | 10 |
| E. Money (YX-14 to YX-17) | 4 | 0 | 0 | 0 | 8 | 0 | 8 |
| F. The rest (YX-05, YX-09 to YX-13) | 6 | 0 | 0 | 0 | 19 | 0 | 19 |
| **All A-F** | **20** | **34** | **0** | **12** | **46** | **0** | **92** |

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
| `/yx/settings/support-access` (company side) | `SupportAccessScreen` (`screens/access/support-access.tsx`) | `/support-access` (approve is step-up) |

## 2. Live pages with no design in this group

- `/staff/channels`: Shared SMS account. It renders `SmsSettingsScreen` from the Notifications designs.
- `/staff/security`: the staff member's own security keys. It is the same page as YukthiX My security
  (`yx/(app)/me/security`).
- The older `/v2/(platform)` pages (Organizations, Plans, Platform admins, All users; "Workfox platform identity") are
  still in the app. They call older APIs such as `billing/plans.controller.ts` (`@Controller('platform')`, key
  `platform:manage_organizations`), which do **not** use `PlatformStaffGuard`. Unsure: I did not check whether those
  routes still let a staff member in from inside a company. See question 1060.

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

#### Support desk (SD-1.31)

| story (sub-page) | verdict | note |
|---|---|---|
| QueueStory · Queue | live | `/staff/support-desk`, `SupportDeskQueueScreen`, `GET /platform/support-desk/tickets?state=` (`platform.support_desk.work`) |
| NotAgent · Queue · not a support agent | live | the API's 403 "not a YukthiX Support agent" shown through `notAgent` (`apps/web/lib/yx-support-desk.ts`) |
| Ticket · Ticket · Priority Support | live | `/staff/support-desk/[id]`, `SupportDeskTicketScreen`; the tenant panel is an audited `platformRead` |
| Asked · Ticket · access asked | live | `POST …/tickets/:id/request-access` (needs both `platform.support_desk.work` and `platform.support.request`) |
| Unlinked · Ticket · not linked | live | `POST …/tickets/:id/link` |

### B. Rules engine (YX-01 to YX-03)

#### YX-01 · Rule-set editor

| story (sub-page) | verdict | note |
|---|---|---|
| YX01List · Rule sets list | wire design | `GET /platform/statutory/rule-sets` (`platform.statutory.manage`) returns every version with status, drafter, reviewer and golden-case count. Gap: the drawing shows "in review"; the table has only draft and published (and `withdrawnAt`) |
| YX01Loading · Rule sets list · loading | wire design | the same list |
| YX01Draft · Slab editor · draft | wire design | `POST /platform/statutory/rule-sets` saves a draft (`statutory_save_draft`), checking its shape first |
| YX01Invalid · Slab editor · overlap, no source | wire design | the API answers `RULE_SHAPE` with the problems (`checkShape`, `statutory/evaluator.ts`); `source` is required |
| YX01Published · Published version (locked) | wire design | published rows are read-only to the app (`StatutoryRuleSet`, "read-only to the app") |

#### YX-02 · Golden-case runner and review

| story (sub-page) | verdict | note |
|---|---|---|
| YX02Runner · Golden cases · 2 failing | design only, feature not built | golden cases are saved with a draft and run only when someone publishes (`runGolden` in `statutory.service.ts`). There is no "run now" endpoint. Small to add: the engine exists |
| YX02Running · Golden cases · running | design only, feature not built | as above |
| YX02Queue · Review queue | wire design | the list above (drafts with drafter and golden count). Gap: no "changes requested" state |
| YX02Review · Review drawer (checker) | wire design | `POST …/rule-sets/:id/publish` (step-up) is the checker's approve; "request changes" is not in the API |
| YX02SelfReview · Maker cannot review own change | wire design | the service refuses the drafter, and the database does too (`statutory_publish`, `YX_MAKER_CHECKER`) |

#### YX-03 · Publish scheduler

| story (sub-page) | verdict | note |
|---|---|---|
| YX03Version · Publish · version | wire design | the draft carries version, valid from and valid to |
| YX03Impact · Publish · tenant impact | design only, feature not built | no endpoint counts the companies or employees a rule change touches |
| YX03PastDated · Publish · past-dated (arrears proposals) | wire design | a past "valid from" can be published; companies then get arrears proposals (`StatutoryArrearsProposal`, `payroll/arrears.service.ts` `refresh`, PAY-7.03) |
| YX03Review · Publish · review | wire design | publish runs the shape checks and golden cases and needs the key again |
| YX03Done · Published and scheduled | wire design | a future "valid from" is the schedule; publishing clears the 5-minute cache |

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
| YX04ComposerTwo · Message composer · two companies need approval (C-2) | live | `POST /platform/customers/messages` |
| YX04Flags · Feature flags | design only, feature not built | no feature flags (search `feature.?flag`: none). Company settings and products per company are live but are not flags |
| YX04KillSwitch · Feature flags · kill switch | design only, feature not built | as above |

#### YX-18 · Contain tenant

| story (sub-page) | verdict | note |
|---|---|---|
| YX18StepUp · Contain tenant · step-up needed | design only, feature not built | step-up exists (`@RequireStepUp`) and so does Suspend company (signs everyone out with `revokeStaffSessions`), but there is no "contain" |
| YX18Ready · Contain tenant · ready | design only, feature not built | the drawing also revokes API keys, OAuth apps and partner grants and starts the breach clock: none built |
| YX18Contained · Contained + tenant banner | design only, feature not built | no hold on exports, bank changes or payouts; no banner |
| YX18Lift · Lift (two people) | design only, feature not built | no two-person lift |

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
| YX10List · Incidents and maintenance | design only, feature not built | no platform incidents or status page; `health/` is a liveness check |
| YX10Compose · Incident update composer | design only, feature not built | as above |
| YX10Maintenance · Maintenance · passes checks | design only, feature not built | no maintenance windows (needed by H-7 availability, answer 948) |
| YX10MaintenanceBlocked · Maintenance · payroll window blocked | design only, feature not built | as above |
| YX10Probes · Probes | design only, feature not built | no probes |

#### YX-11 · Help-centre editor

| story (sub-page) | verdict | note |
|---|---|---|
| YX11List · Help articles and no-result searches | design only, feature not built | no console path. Each company's knowledge base and its "searches with no result" exist (`service-desk/kb.service.ts` `contentGaps`, `GET …/kb/gaps`) but only inside one company. Unsure whether YukthiX's starter articles (answer 942) should be written here or in the platform company's own Helpdesk |
| YX11Edit · Article editor | design only, feature not built | as above; the company article editor (HLP-04) is reusable |

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
