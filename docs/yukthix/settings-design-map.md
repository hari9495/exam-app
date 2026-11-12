# Settings: designs and what exists (audit)

This file checks, story by story, every design under `Screens/Settings/` against what is live, in the same shape as
`console-design-map.md` and `help-onboarding-design-map.md`. Founder rules: every policy choice is a company setting with
a default, never hard-coded; never build a second, simpler version of a designed screen (make the designed one live);
build only from the design kit.

Status 12 Nov 2026 (branch `docs/yukthix-settings-map`, from `test/yukthix-main` at b33f4af6e). Audit only: nothing was
built.

## What is live today (plain English)

- **There is no Settings home and no group pages.** The drawn Settings home (search across every setting) and the eight
  group landing pages (`SettingsHomeScreen`, `SettingsGroupScreen`) are on the kit's not-live list. There is no page at
  /yx/settings. People reach settings through the Settings rail in the menu (`apps/web/lib/yx-nav.ts`), which lists the
  live pages under the group names.
- **The drawn settings page is live four times.** The settings map draws 71 pages with one shared page
  (`SettingsPageScreen`). Four of them are live with real data and saving: **3.12 Visitors**, **4.9 Contract labour**,
  **6.1 Hiring** and **6.2 Staffing desk** (each area's own `GET/PUT …/settings`). The shared page states that come with
  it (unsaved changes, save failed, read-only, loading, error) work on those four.
- **Many other pages are live in another shape.** About 40 of the 71 pages do their job today through a different live
  page, which is why most rows below are "live (gap)":
  - Organisation pages drawn as their own screens (`Screens/Settings/Organisation`): Legal entities, Locations,
    Structure, and three registry pages (`CompanySettingsScreen`): **Company rules**, **Access and privacy**,
    **Payroll rules**. All 22 of those stories are live as drawn.
  - Global core: Countries, Translations and Me › Language, all live as drawn.
  - Area set-up pages: Time › Set-up (leave types, policies, holidays, locations, devices, year end), Shifts set-up,
    Periods; Payroll set-up, pay groups, components, salary templates, payslip layout, statutory, loans, earned wage
    access, payment files; Expense policy; Performance set-up; Letter templates, Emails, Text messages (SMS); Helpdesk
    set-up, Policy admin, Speak-up set-up; Roles & access, Security settings, Single sign-on, Support access, Set-up
    hub, Custom fields and Onboarding checklists.
- **About 100 company settings have a starter value but no screen.** The API's settings registry
  (`apps/api/src/org-structure/settings-registry.ts`, 293 keys) is the store behind every page. A search for each key
  in apps/web and the kit found 105 keys that appear nowhere outside the API (list in section 3). Most belong to drawn pages that are
  not wired: leave choices, attendance and roster limits, kiosk, field tracking, payroll policies, tax windows, exit and
  rehire, expenses and performance. They work with their starter value; HR cannot change them. That breaks the founder
  rule "a default AND an HR setting". Caveat: a few areas map keys to their own field names (for example the Helpdesk
  page's "Show page help" is `help.page_help`); I checked Helpdesk, Performance and Expenses by hand and only
  `help.page_help` was a false hit (left out). The other way round, some keys are only named in a kit comment (for
  example `payroll.late_request_max_days`, `attendance.lock_flow`) and still have no place to change them, so the real
  number is higher; unsure by how much.
- **Integrations, developers and billing exist only in the older /v2 app.** API keys, webhooks, connected apps,
  calendar connections, the AI key, SMS and WhatsApp for candidates, plans, Stripe checkout and invoices have APIs and
  /v2 org-admin pages (`apps/web/app/v2/(org-admin)/settings/…`), which are not the YukthiX design. The drawn pages in
  groups 7 and 8 are therefore "wire design", pending a security check of those older routes.
- **Not built at all:** customisation builders, a company-wide rules builder, approval policies per request type,
  asset categories, partners, benefits and FBP, document types, announcements, Engage, learning, assessment defaults,
  verification providers, analytics, deepfake detection, sandbox, and data export with account closure.

Verdicts (the same words as the other maps): **live** · **live (gap)** (the gap is named) · **wire design** (the API
exists, the screen is not wired) · **design only, feature not built** · **phone view, mobile app not built**. Here
"live (gap)" also covers a page whose job is done by another live page (named in the note) rather than the drawn
settings page itself. For a read-only story, the note says how the live page treats someone without the key; "unsure"
means the live page passes no manage flag that I could see and I did not read the screen's inside.

## Counts (sub-pages = stories)

After S-1 (Settings home, search and the eight group pages live; four live stories added) and S-2 (the Time & Leave pages with their settings; one live story added; appendix script "ok").

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Settings home and page states | 1 | 17 | 2 | 4 | 1 | 0 | 24 |
| B. Organisation and Global core | 2 | 25 | 0 | 0 | 0 | 0 | 25 |
| C. Settings map, groups 1 to 8 | 8 | 31 | 87 | 20 | 32 | 0 | 170 |
| **All A-C** | **11** | **73** | **89** | **24** | **33** | **0** | **219** |

Per group (C):

| group | live | live, gap | wire design | feature not built | stories |
|---|---|---|---|---|---|
| Group 1 · Organisation | 2 | 12 | 0 | 4 | 18 |
| Group 2 · People & Access | 2 | 14 | 2 | 6 | 24 |
| Group 3 · Time & Leave | 3 | 24 | 0 | 0 | 27 |
| Group 4 · Payroll & Statutory | 3 | 16 | 4 | 2 | 25 |
| Group 5 · Documents & Communication | 2 | 12 | 0 | 6 | 20 |
| Group 6 · Hiring & Assessments | 15 | 3 | 0 | 4 | 22 |
| Group 7 · Integrations & Developers | 2 | 4 | 8 | 6 | 20 |
| Group 8 · Billing & Account | 2 | 2 | 6 | 4 | 14 |

Counted by script 12 Nov 2026 on `docs/yukthix-settings-map` (the script is in the appendix). There are 214 stories in
11 files whose title starts `Screens/Settings/`, one file per title (checked: no title spans two files):
`screens/settings/settings-home.stories.tsx` (20), `screens/global/global.stories.tsx` (3),
`screens/org/org.stories.tsx` (22) and `screens/settings/settings-g1.stories.tsx` to `settings-g8.stories.tsx`
(18, 24, 26, 25, 20, 22, 20, 14). Story names are the exported names that start with a capital letter. None is a phone
view (the phone settings screens are under other titles).

Cross-checked with the area maps: `hiring-design-map.md` (6.1, 6.2 and the group 6 overview), `visitors-design-map.md`
(3.12), `contract-labour-design-map.md` (4.9). Their verdicts are kept and were checked in code (the four pages render
`SettingsPageScreen` with `pageId` 6.1, 6.2, 3.12 and 4.9; nothing else in apps/web does).

## 1. Live pages

| page | screen | API | settings-map page |
|---|---|---|---|
| /yx/settings/hiring | `SettingsPageScreen` 6.1 (designed) | `GET/PUT hiring/settings`, scorecard templates, stage targets | 6.1 |
| /yx/settings/staffing | `SettingsPageScreen` 6.2 (designed) | `GET/PUT staffing/settings`, invoice series | 6.2 |
| /yx/settings/visitors | `SettingsPageScreen` 3.12 (designed) | `GET/PUT visitors/settings`, visitor types | 3.12 |
| /yx/settings/contract-labour | `SettingsPageScreen` 4.9 (designed) | `GET/PUT contract-labour/settings`, registrations | 4.9 |
| /yx/settings/company-rules | `CompanySettingsScreen` organisation | `GET/PUT/DELETE org/settings` | keys of 1.5, 2.5, 2.6, 2.9, 3.1, 3.3, 5.7, 8.6 |
| /yx/settings/access-settings | `CompanySettingsScreen` access | same, plus `people/privacy-erasure` | keys of 2.1, 2.2, 2.10 |
| /yx/settings/payroll-rules | `CompanySettingsScreen` payroll | same | keys of 4.6 (and statutory bonus) |
| /yx/settings/legal-entities, /locations, /structure | `LegalEntitiesScreen`, `LocationsScreen`, `StructureScreen` | `org/legal-entities`, `org/locations`, `org/masters` | 1.2, 1.3, 1.4 |
| /yx/settings/countries, /translations, /yx/me/language | `CountryGuideScreen`, `TranslationsScreen`, `MyLanguageScreen` | `global/…` | part of 1.1 |
| /yx/settings/setup-hub | `SetupHubScreen` | `help/setup-hub` | 1.6 |
| /yx/settings/custom-fields | `EmployeeFieldsScreen` | `custom-fields` | 1.5 |
| /yx/settings/access | `RolesAccessScreen` | `access` | 2.1 |
| /yx/settings/checklists | `JourneyTemplatesScreen` | `lifecycle/journey-templates` | 2.5 |
| /yx/settings/security, /identity-providers, /support-access | `SecuritySettingsScreen`, `IdentityProvidersScreen`, `SupportAccessScreen` | `security/policy`, `security/identity-providers`, `support-access` | 2.3 |
| /yx/settings/expenses | `PolicyMatrixScreen` | `expenses` policies | 4.8 |
| /yx/settings/performance | `PerformanceSetupScreen` | `performance` scales and templates | 6.3 |
| /yx/settings/letters | `LetterTemplatesList`, `SignatoriesDrawer` | `letters` | 5.2, 5.3 |
| /yx/settings/emails | `EmailSettingsScreen` | `notifications/email` | 5.4 |
| /yx/settings/sms | `SmsSettingsScreen` | `notifications/sms` | 5.5 |
| /yx/time/setup (+ types, holidays, holiday-feeds, locations, devices, year-end), /yx/time/shifts-setup, /yx/time/periods | Time set-up screens | `time/setup/…`, `time/shifts…`, `time/devices`, `time/periods` | 3.2 to 3.4, 3.6 to 3.11, 7.2 |
| /yx/payroll/setup, pay-groups, periods, components, templates, payslip-layout, statutory, statutory-rules, loans, ewa, payment-modes | Payroll set-up screens | `payroll/…`, `statutory` | 4.1, 4.2, 4.4, 4.6, 4.7, 4.10, 7.3 |
| /yx/desk/setup, /yx/desk/policy-admin, /yx/desk/speakup-setup | `DeskSetupScreen`, `PolicyAdminScreen`, `SpeakUpSetupScreen` | `desk/…` | 5.8, 5.7, 2.9 |

## 2. Live pages with no design in this group, and duplicates

**Second versions** (two drawn or built versions of one page; the founder rule says keep one):

| drawn on the settings map | also drawn or live | note |
|---|---|---|
| 1.2 Legal entities, 1.3 Locations, 1.4 Structure masters | `LegalEntitiesScreen`, `LocationsScreen`, `StructureScreen` (drawn under Settings/Organisation, live) | two designs of the same three pages (question 1321) |
| keys on 1.5, 2.1, 2.2, 2.5, 2.6, 2.9, 2.10, 3.1, 3.3, 4.6, 5.7, 8.6 | Company rules, Access and privacy, Payroll rules (`CompanySettingsScreen`, drawn and live) | the same settings drawn in two page formats (question 1321) |
| 1.1 Language and region | Countries, Translations (Global core, live) | question 1321 |
| 2.3 Security | `SecuritySettingsScreen`, `IdentityProvidersScreen`, `SupportAccessScreen` (live, drawn in the Security group) | question 1321 |
| 1.1 (name, logo, colour), 1.5 (custom fields), 2.1 (roles), groups 7 and 8 | older /v2 org-admin pages: Branding, Custom fields, Roles, Permission profiles, Field permissions, Record visibility, Integrations, Billing, SSO, Reminders, Pipelines, Scheduled reports | undesigned older versions (question 1327) |
| 2.4 Approvals and 6.1 approvals | /yx/hiring/approval-routes (`ApprovalRoutesScreen`, a stand-in; hiring map) | question 1330 |

**Live pages with no drawn settings-map page:** /yx/payroll/country-packs, /yx/payroll/imports, /yx/time/setup/licences,
/yx/admin/login-activity, /yx/hiring/retention. They are drawn in their own areas.

## 3. Designs with no live page, and settings with no screen

**Not built** (33 rows): 1.7, 1.8, 2.4, 2.8, 2.11, 4.11, 5.1, 5.6, 5.9, 6.4, 6.5, 7.4, 7.8, 7.9, 8.4, 8.5 (two stories
each) and the payroll second-approver page state.

**Wire design** (50 rows): Settings home (8) and the search highlight, the 8 group pages (16), the legal-floor states
(2), change history (1), and the pages whose settings are in the API with no screen: 2.7, 4.3, 4.5, 7.1, 7.5, 7.6,
7.7, 8.1, 8.2, 8.3.

**Registry keys with no screen** (105; exact-key search over `apps/web` and `packages/yx-ui/src`, with tests, stories,
e2e and the kit's settings-map sample data left out; `help.page_help` left out by hand, see above):

- Leave (13) and attendance, roster, kiosk and field (27): on their Time & Leave pages since S-2 (answer 1323, see "S-2 as built").
- Safety and disputes (4): `accident.injury_types`, `accident.injury_leave_type`, `accident.contractor_reminder_days`,
  `dispute.lawyer_may_approve`.
- Payroll and tax (16): `payroll.variance_threshold_pct`, `payroll.protected_net_percent`, `payroll.net_rounding`,
  `payroll.leave_encashment_basis`, `payroll.notice_shortfall`, `payroll.standard_daily_hours`,
  `payroll.payslip_email`, `payroll.one_time_review_above`, `payroll.mid_period.join`, `payroll.mid_period.exit`,
  `payroll.mid_period.revision`, `payroll.mid_period.cutoff_day`, `payroll.document_retention_years`,
  `tax.regime_cutoff`, `tax.proof_window_opens`, `tax.proof_cutoff`.
- People lifecycle and audit (15): `exit.notice.probation`, `exit.notice.confirmed`, `rehire.pf`, `rehire.same_fy_tax`,
  `rehire.service`, `rehire.gratuity`, `rehire.leave`, `rehire.probation`, `rehire.prior_records`, `absconding.days`,
  `retirement.age`, `retirement.alert_months`, `vrs.benefit_days`, `alumni.access_years`, `audit.retention_years`.
- Policies (1): `policy.ai_draft.discard_days`.
- Expenses (14): `expense.finance_audit`, `expense.claim_window_days`, `expense.cc_owner_above`,
  `expense.route.default`, `expense.route.payout_above`, `expense.payroll_cutoff_day`,
  `expense.advance.recovery_instalments`, `expense.advance.settle_days`, `expense.fx_tolerance_pct`,
  `expense.gst.capture`, `expense.card.match_amount_within`, `expense.card.match_days`, `expense.card.reminder_days`,
  `expense.card.recovery_instalments`.
- Performance (11): `perf.goal.approval`, `perf.self_review.visible_to_manager`, `perf.anonymity.min_responses`,
  `perf.report.min_cell`, `perf.comp.budget_overrun`, `perf.pay_band.visible`, `perf.pay_equity.flag_pct`,
  `perf.comp.market_stale_months`, `perf.dispute.escalate_days`, `perf.ai.review_assistant`, `perf.goal.checkin_days`.
- Hiring (4, belong to 6.1): `hiring.offer.default_conditions`, `hiring.scorecard.overdue_hours`,
  `hiring.bulk_offer.plan_check`, `hiring.interview_day.whatsapp_reminders`.

**Searches run** (12 Nov 2026, on `test/yukthix-main` at b33f4af6e):

- Kit screens in the web app: `grep -rnE "SettingsPageScreen|SettingsGroupScreen|SettingsHomeScreen|pageId=\"[0-9]"
  apps/web`: only the four pages above (6.1, 6.2, 3.12, 4.9). `SettingsGroupScreen` and `SettingsHomeScreen` are on the
  `notLive` list of `packages/yx-ui/src/design-live-guard.known.json`.
- Settings endpoints: `grep -rnE "@(Get|Put|Patch)\('[^']*settings" apps/api/src --include=*.controller.ts`: org,
  hiring, staffing, visitors, contract-labour, desk (catalogue, knowledge base, privacy), platform, and the older
  organizations (pipeline, reminder, scheduled-report settings). No time, payroll, people, expenses or performance
  settings endpoint: those use `PUT org/settings` (the registry), which accepts every registered key.
- API keyword searches in `apps/api/src` (`*.ts`, specs left out), keyword: result.
  - `announcement`: none. `kudos|recognition`: none related. `attrition`: none. `deepfake`: none.
  - `insurance|fbp|flexible benefit|employer nps`: none related. `sandbox`: CSP headers only.
  - `close.?account|tenant.close|whole.?company export`: none. `customis|form.?builder|field.?builder`: none.
  - `partner.?link|partner.?firm`: none. `course|learning`: none related (MFA enrolment).
  - `directory.?privacy`: none. `workflow.?polic|request.?type.*polic`: none.
  - `documentType.(create|update|upsert)`: none. `pan.?verif|penny.?drop|bank.?verif|digilocker`: the payout
    service's note that no provider is wired.
- Schema (`apps/api/prisma/schema.prisma`) model names: no Announcement, Course, Benefit, Insurance, Sandbox, Partner,
  ApiKey or AssetCategory model. `Rule`, `RuleVersion`, `AutomationRun` exist (used by the Helpdesk only).
- Older web pages: `find apps/web/app/v2/(org-admin) -name page.tsx`: audit-log, data-rights, settings/approval-emails,
  billing, branding, business-hours, certificate, custom-fields, easy-apply, field-permissions, integrations,
  interview-emails, permission-profiles, pipelines, record-visibility, recycle-bin, reminders, roles, scheduled-reports,
  sender-addresses, sso, user-groups, system-logs, users.

## 4. Design groups, story by story

### A. Settings home and page states

#### Settings home and page states

File: `packages/yx-ui/src/screens/settings/settings-home.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Home · Settings home | live | S-1: /yx/settings renders `SettingsHomeScreen` with `live`: only the pages the viewer may open (those whose live editor is in their menu, `SETTINGS_PAGE_EDITORS` in `apps/web/lib/yx-nav.ts`), each linking to its live editor; the drawn examples (recently changed, starter count, set-up alert) are left out in live (questions 1461, 1462) |
| HomeSearch · Settings home · search "probation" | live | S-1: search over the page list and its words; each result opens its page's live editor; drawn example values are not shown in live (question 1463) |
| HomeSearchPf · Settings home · search "PF ceiling" | live | same |
| HomeSearchLate · Settings home · search "late coming" | live | same (finds pages with a live editor; 3.5 has none yet, S-2) |
| HomeSearchEmpty · Settings home · no results | live | same, with Clear search |
| HomeLimited · Settings home · HR admin (only manageable pages) | live | the viewer's menu decides: pages they may open, by the same keys as the menu (the API checks every call) |
| HomeLoading · Settings home · loading | live | while the menu's keys load |
| HomeError · Settings home · error | live | the error state with Retry |
| HomeLive · Settings home · live, System Admin (S-1) | live | the live home as built: search in the header, each group's first four pages and "+N more" to the group page (fits 1278 x 635) |
| HomeLiveSearch · Settings home · live, search "probation" (S-1) | live | results link to the live editor; no drawn values |
| HomeLivePayroll · Settings home · live, payroll admin only (S-1) | live | only Payroll & Statutory and Integrations pages; no People & Access |
| GroupLive · Group page · live, Time & Leave (S-1) | live | /yx/settings/time-and-leave: page tiles linking to the live editors |
| PageFromSearch · Page · opened from search (field highlighted) | wire design | `highlightKey` exists in `SettingsPageScreen`, but no live page passes it (searched apps/web/app/yx/(app)/settings); it comes with the home search |
| PageDirty · Page · unsaved changes | live | `useUnsavedChangesGuard` in `SettingsPageScreen` runs on the live pages (6.1, 6.2, 3.12, 4.9) |
| PageBelowLegalMinimum · Page · below the legal minimum (blocked) | wire design | `validateDraft` blocks it in the live component, but none of the four live pages has a field with a legal floor (checked their page data); the drawn example (3.6 maternity) is not wired; set-by-law values are in the statutory rule store |
| PageAboveLegalMaximum · Page · above the legal maximum (blocked) | wire design | same (3.3 weekly hours; `roster.max_weekly_hours` is in the registry with no screen) |
| PagePayrollApproval · Page · payroll change needs a second approver | design only, feature not built | `needsSecondApprover` (`settings-logic.ts` line 251) is used only on the demo save path; the live save skips it, and the API has no second approver for setting changes (`PUT org/settings` saves at once) |
| PageSaveFailed · Page · save failed (edits kept) | live | the live save shows the refusal and keeps the edits (`settings-screens.tsx` around line 425) |
| PageSecurity · Page · security change asks to confirm | live (gap) | the "confirm it's you" step works on live pages for `sensitive` fields (3.12 watch-list); the drawn example is 2.3 Security, whose live page is `SecuritySettingsScreen` instead |
| PageScopeOverride · Page · editing overrides for a location | live (gap) | "Different for" values are live on 6.2 per legal entity (answer 495, `staffingEntityChanges`) and visitors shows own values per location; the drawn example (3.1 per location) is not wired |
| PageHistory · Page · change history | wire design | live pages show only the last change (`lastChange` from each area service); every write is audited and `GET audit-logs` exists (`audit:view`), but no page lists a page's history |
| PageReadOnly · Page · read-only (no permission) | live | read-only by key works on the four live pages; the drawn example (4.7) is not wired |
| PageLoading · Page · loading | live | `live.state` from `loadState` |
| PageError · Page · error | live | the error state with Retry (`live.onRetry`) |

### B. Organisation and Global core (drawn as their own screens)

#### Global core

File: `packages/yx-ui/src/screens/global/global.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Countries · Countries · Add a country | live | /yx/settings/countries renders `CountryGuideScreen` (`global/country-setups…`; week and language per entity through `PUT org/settings`) |
| CompanyWords · Translations · leave types | live | /yx/settings/translations renders `TranslationsScreen` (`GET/PUT global/translations`) |
| MyLanguage · Me › Language | live | /yx/me/language renders `MyLanguageScreen` (`GET/PUT global/me/language`) |

#### Organisation

File: `packages/yx-ui/src/screens/org/org.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| LegalEntities · Legal Entities | live | /yx/settings/legal-entities, `LegalEntitiesScreen`, `org/legal-entities…` |
| Locations · Locations | live | /yx/settings/locations, `LocationsScreen`, `org/locations…` |
| LocationsRemoveGeofence · Locations · taking a geofence off asks first | live | same page; the confirmation is inside `LocationsScreen` (`screens/org/locations.tsx` line 99) |
| Structure · Structure | live | /yx/settings/structure, `StructureScreen`, `org/masters/:kind` |
| StructureWithPay · Structure With Pay | live | same page with `pay` (changed with `pay.range.manage`), `org/grades/:id/pay-ranges` |
| NoAccess · No Access | live | `loadState` turns a 403 into the no-access state (`apps/web/lib/yx-org`) |
| CompanyRules · Company Rules | live | /yx/settings/company-rules, `CompanySettingsPage section="organisation"` (`apps/web/lib/yx-settings-page.tsx`), `GET/PUT/DELETE org/settings` |
| CompanyRulesBringOnDayOne · Company rules · joining day · what to bring (text) | live | same page, `joining.bring_on_day_one` (a text setting) |
| AccessAndPrivacy · Access And Privacy | live | /yx/settings/access-settings, `CompanySettingsPage section="access"` |
| AccessAndPrivacyErasureDryRun · Access and privacy · Special data erasure · dry run (off), whose data | live | same page; `GET people/privacy-erasure` for org.settings.manage |
| AccessAndPrivacyErasureOn · Access and privacy · Special data erasure · on, no one due, last run | live | same |
| AccessAndPrivacyErasureOnDue · Access and privacy · Special data erasure · on, people due at the next run | live | same |
| AccessAndPrivacyErasureNoAccess · Access and privacy · Special data erasure · no company-wide settings rights (no card) | live | a 403 on the dry run hides the card |
| AccessAndPrivacyGuarded · Access And Privacy Guarded | live | `heldGuards` from `access.role.manage`; the API checks the guard key as well |
| PayrollRules · Payroll Rules | live | /yx/settings/payroll-rules, `CompanySettingsPage section="payroll"` |
| PayrollRulesLoanTooEarly · Payroll rules · loan interest · pressed too early | live | same page; the setting editor's save errors |
| PayrollRulesBonusRule · Payroll rules · bonus eligibility rule editor | live | same page; `payroll.bonus.eligibility_rate_on` |
| PayrollRulesReadOnly · Payroll rules · read only | live | payroll set-up without org.settings.manage only reads it |
| PayrollRulesLoading · Payroll rules · loading | live | `loadState` |
| PayrollRulesError · Payroll rules · error | live | `loadState`; Retry loads again |
| CompanyRulesLoading · Company Rules Loading | live | `loadState` |
| CompanyRulesError · Company Rules Error | live | `loadState` |

### C. Settings map, groups 1 to 8

#### Group 1 · Organisation

File: `packages/yx-ui/src/screens/settings/settings-g1.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 1 · Organisation | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 1 · loading | live | same, loading |
| P1_1 · 1.1 Company & branding | live (gap) | parts live on other pages: language per entity on /yx/settings/countries (`PUT org/settings` `people.language`), company words on /yx/settings/translations, email logo and wording on /yx/settings/emails (`EmailBranding`); company name, logo and colour only on the older /v2 Branding page (`organizations/branding`); white-label is staff-only (`brand.white_label`, console); custom domain and data region not built (searched `custom.?domain|data.?region` in apps/api/src: none) |
| P1_1_ReadOnly · 1.1 Company & branding · read-only | live (gap) | read-only: Countries and Translations take `canManage` (org.settings.manage) |
| P1_2 · 1.2 Legal entities | live (gap) | /yx/settings/legal-entities renders `LegalEntitiesScreen` (drawn under Settings/Organisation; `org/legal-entities…`, `…/statutory`); this settings-map version is not rendered: a second design of the same page |
| P1_2_ReadOnly · 1.2 Legal entities · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P1_3 · 1.3 Locations | live (gap) | /yx/settings/locations renders `LocationsScreen` (`org/locations`); geofence and networks on /yx/time/setup/locations (`GeofenceEditorScreen`, `time/setup/locations/:id/points`, `…/networks`); this settings-map version is not rendered |
| P1_3_ReadOnly · 1.3 Locations · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P1_4 · 1.4 Structure masters | live (gap) | /yx/settings/structure renders `StructureScreen` (`org/masters/:kind`, grade pay ranges); this settings-map version is not rendered |
| P1_4_ReadOnly · 1.4 Structure masters · read-only | live (gap) | read-only: `canManage`; pay ranges by `pay.range.manage` |
| P1_5 · 1.5 Employee records | live (gap) | custom fields on /yx/settings/custom-fields (`EmployeeFieldsScreen`); the employee-code rule (`employee_code.scope`) on Legal entities; required personal details on Company rules; the "Employments and bank accounts" section: unsure, no page found for it |
| P1_5_ReadOnly · 1.5 Employee records · read-only | live (gap) | read-only: Custom fields takes `canManage` |
| P1_6 · 1.6 Set-up hub | live (gap) | /yx/settings/setup-hub renders `SetupHubScreen` (`GET help/setup-hub`, Help H-6); the Go-live section is left out (help map question 1011) |
| P1_6_ReadOnly · 1.6 Set-up hub · read-only | live (gap) | read-only: unsure (the page passes no manage flag; the menu shows it to settings admins only) |
| P1_7 · 1.7 Customisation | design only, feature not built | builders (PLT-22 to PLT-25), promotion and starter library: searched `customis|form.?builder|field.?builder` in apps/api/src: none. Custom fields (1.5) is the only builder that is live |
| P1_7_ReadOnly · 1.7 Customisation · read-only | design only, feature not built | as the page |
| P1_8 · 1.8 Policies, rules & automations | design only, feature not built | the rules engine (`rules-engine/automation.service.ts`; tables `Rule`, `RuleVersion`, `AutomationRun`) is used only by Helpdesk automations (`desk/setup`, `RulesAdmin`); there is no company-wide rule builder, rule approval, Workflow Studio or emergency stop API |
| P1_8_ReadOnly · 1.8 Policies, rules & automations · read-only | design only, feature not built | as the page |

#### Group 2 · People & Access

File: `packages/yx-ui/src/screens/settings/settings-g2.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 2 · People & Access | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 2 · loading | live | same, loading |
| P2_1 · 2.1 Roles & access | live (gap) | /yx/settings/access renders `RolesAccessScreen` (`access` API); Manager access and Special permissions are on /yx/settings/access-settings (`CompanySettingsScreen`, section access) |
| P2_1_ReadOnly · 2.1 Roles & access · read-only | live (gap) | read-only: unsure; Roles & access is in the menu only for `access.role.manage` |
| P2_2 · 2.2 Directory & privacy | live (gap) | privacy (who accessed my data, retention, erasure) and Home page (net pay) are on /yx/settings/access-settings; directory visibility, transparency, external logins and privacy notices: searched `directory.?privacy` in apps/api/src: none |
| P2_2_ReadOnly · 2.2 Directory & privacy · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P2_3 · 2.3 Security | live (gap) | /yx/settings/security renders `SecuritySettingsScreen` (`security/policy`), plus /yx/settings/identity-providers (`security/identity-providers`) and /yx/settings/support-access (`SupportAccessScreen`); this settings-map version is not rendered: a second design of the same page |
| P2_3_ReadOnly · 2.3 Security · read-only | live (gap) | read-only: unsure; Security is in the menu for admin roles only |
| P2_4 · 2.4 Approvals | design only, feature not built | no approval policy per request type: the approvals engine (`workflow/approvals-engine.service.ts`) takes its chain, reminders and timeout from each caller in code; delegation is live (/yx/me/delegation). The older `organizations/approvals` chains (`ApprovalChain`) serve hiring only (/yx/hiring/approval-routes). Searched `workflow.?polic|request.?type.*polic`: none |
| P2_4_ReadOnly · 2.4 Approvals · read-only | design only, feature not built | as the page |
| P2_5 · 2.5 Onboarding & probation | live (gap) | journey templates on /yx/settings/checklists (`JourneyTemplatesScreen`, `lifecycle/journey-templates`); probation and joining day on Company rules; pre-boarding settings: none found |
| P2_5_ReadOnly · 2.5 Onboarding & probation · read-only | live (gap) | read-only: unsure (the page passes no manage flag) |
| P2_6 · 2.6 Job changes & transfers | live (gap) | Job changes and Inter-entity transfer defaults on /yx/settings/company-rules (`employee_change.retro_limit`, `promotion.must_change`, `transfer.*`); change types and deputation: none found |
| P2_6_ReadOnly · 2.6 Job changes & transfers · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P2_7 · 2.7 Exit & lifecycle policies | wire design | the registry holds `exit.notice.probation`, `exit.notice.confirmed`, `rehire.*` (7 of its 8 keys), `absconding.days`, `retirement.age`, `retirement.alert_months`, `vrs.benefit_days` and `alumni.access_years` with starter values, and none of them is on any screen (exact-key search over apps/web and yx-ui); only `contract.max_years` and `contract_end.action` are on Company rules. `PUT org/settings` already saves any of them |
| P2_7_ReadOnly · 2.7 Exit & lifecycle policies · read-only | wire design | same |
| P2_8 · 2.8 Assets | design only, feature not built | the asset register is live (/yx/people/assets, `lifecycle/assets`), but `Asset.category` is free text and there are no issue or return rules; no API for the drawn categories or rules |
| P2_8_ReadOnly · 2.8 Assets · read-only | design only, feature not built | as the page |
| P2_9 · 2.9 Employee relations & cases | live (gap) | Speak-up on Company rules (`speakup.*`, `cases.reply_days`, `cases.disciplinary.reply_days`) and /yx/desk/speakup-setup (`SpeakUpSetupScreen`); the Internal Committee (POSH) and retention parts: unsure |
| P2_9_ReadOnly · 2.9 Employee relations & cases · read-only | live (gap) | read-only: `canManage` on Company rules |
| P2_10 · 2.10 Audit & data retention | live (gap) | retention on /yx/settings/access-settings (`privacy.retention.*`, erasure); `audit.retention_years` is in the registry with no screen; data-subject requests exist only for the service desk (/yx/desk/privacy, `desk/privacy/settings`) |
| P2_10_ReadOnly · 2.10 Audit & data retention · read-only | live (gap) | read-only: `canManage` |
| P2_11 · 2.11 Partners | design only, feature not built | the partner programme is not built (console map D, YX-06 to YX-08); searched `partner.?link|partner.?firm`: none |
| P2_11_ReadOnly · 2.11 Partners · read-only | design only, feature not built | as the page |

#### Group 3 · Time & Leave

File: `packages/yx-ui/src/screens/settings/settings-g3.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 3 · Time & Leave | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 3 · loading | live | same, loading |
| P3_1 · 3.1 Attendance modes | live (gap) | the Attendance section of /yx/settings/company-rules (`attendance.mode`, `attendance.missing_punch_effect`, `attendance.factories_act`, dated); this 3.1 page is not rendered |
| P3_1_ReadOnly · 3.1 Attendance modes · read-only | live (gap) | read-only: `canManage` |
| P3_2 · 3.2 Check-in & devices | live (gap) | S-2: /yx/settings/time/check-in-and-devices renders this page (`SettingsPageScreen` with `live`, `timeSettingsPage`): check-in opening, phone binding, the kiosk sign-in ways, training check-in and PIN tries, and a Field staff tracking section (4 settings), each marked Starter default until changed; links to Locations & geofences and Devices. Gap: drawn methods, offline age, face check-in fields have no setting yet |
| P3_2_ReadOnly · 3.2 Check-in & devices · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_3 · 3.3 Shifts & patterns | live (gap) | S-2: /yx/settings/time/shifts-and-patterns: the working-hour limits (with the legal maximums from IN.SETTINGS.LIMITS: 9 h a day, 48 h a week, 10.5 h spread-over, Factories Act 1948), least rest, overtime pre-approval, call-out minimum, roster notice and open shifts; links to the shift editor and the roster. Gap: breaks, grace, OT rate and rounding fields stay on Shifts set-up |
| P3_3_ReadOnly · 3.3 Shifts & patterns · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_4 · 3.4 Weekly offs | live (gap) | S-2: /yx/settings/time/weekly-offs: weekly offs each week at least (legal minimum 1, Factories Act 1948 s.52). Gap: precedence, location defaults and custom rules (weekly offs per location are on Time › Locations) |
| P3_4_ReadOnly · 3.4 Weekly offs · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_5 · 3.5 Late & regularisation | live (gap) | S-2: /yx/settings/time/late-and-regularisation: late-mark penalty, fixes a month, work from home limit and same-day WFH, presence on WFH days and the on-duty windows (8 settings that had no screen). Gap: the drawn free late marks, deduction order, fix types, look-back and shift swaps have no setting yet |
| P3_5_ReadOnly · 3.5 Late & regularisation · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_6 · 3.6 Leave types | live (gap) | S-2: /yx/settings/time/leave-types: request rules, year end and company choices (10 settings that had no screen); links to the leave type editor and the year-end wizard. Gap: the drawn crediting, statutory templates and maternity fields are on the leave type editor |
| P3_6_ReadOnly · 3.6 Leave types · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_7 · 3.7 Leave policies | live (gap) | /yx/time/setup, `LeavePoliciesScreen` (`time/setup/policies`, versions, assign, `setup/policy-order`) |
| P3_7_ReadOnly · 3.7 Leave policies · read-only | live (gap) | read-only: unsure |
| P3_8 · 3.8 Holiday calendars | live (gap) | S-2: /yx/settings/time/holiday-calendars: optional holidays after a move; links to the calendars and the holiday feed. Gap: optional holiday counts and weekly-off clash rules |
| P3_8_ReadOnly · 3.8 Holiday calendars · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_9 · 3.9 Leave year | live (gap) | S-2: /yx/settings/time/leave-year: the month the leave year starts and planned leave on block dates. Gap: blackout date lists |
| P3_9_ReadOnly · 3.9 Leave year · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_10 · 3.10 Periods & locks | live (gap) | /yx/time/periods (`PeriodsScreen`: lock, unlock, freeze); `payroll.late_request_max_days` has no screen |
| P3_10_ReadOnly · 3.10 Periods & locks · read-only | live (gap) | read-only: unsure |
| P3_11 · 3.11 Projects & timesheets | live (gap) | S-2: /yx/settings/time/projects-and-timesheets: calendars and work tools for timesheet suggestions; link to project codes. Gap: approvals, utilisation and budgets |
| P3_11_ReadOnly · 3.11 Projects & timesheets · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; a guarded setting (phone binding, kiosk PIN tries) also needs the access key |
| P3_12 · 3.12 Visitors | live (gap) | visitors map: /yx/settings/visitors renders this designed page (`SettingsPageScreen` pageId 3.12, `GET/PUT visitors/settings`); its gap is listed there |
| P3_12_ReadOnly · 3.12 Visitors · read-only | live (gap) | visitors map: reception reads it |
| TimeLive · Time & Leave page · live with the company settings (S-2) | live | the eight S-2 pages with sample company values (`page` 0 to 7): Starter default chips, legal maximums and minimums naming the Act, the drawn editor links |

#### Group 4 · Payroll & Statutory

File: `packages/yx-ui/src/screens/settings/settings-g4.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 4 · Payroll & Statutory | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 4 · loading | live | same, loading |
| P4_1 · 4.1 Pay groups & calendars | live (gap) | /yx/payroll/pay-groups (`PayrollSetupScreen`) and /yx/payroll/periods (`PayPeriodsScreen`) |
| P4_1_ReadOnly · 4.1 Pay groups & calendars · read-only | live (gap) | read-only: unsure |
| P4_2 · 4.2 Components & templates | live (gap) | /yx/payroll/components (`ComponentLibraryScreen`) and /yx/payroll/templates (`TemplateBuilderScreen`) |
| P4_2_ReadOnly · 4.2 Components & templates · read-only | live (gap) | read-only: unsure |
| P4_3 · 4.3 Payroll policies | wire design | `payroll.protected_net_percent`, `payroll.net_rounding`, `payroll.leave_encashment_basis`, `payroll.notice_shortfall`, `payroll.one_time_review_above`, `payroll.variance_threshold_pct`, `payroll.standard_daily_hours` and `payroll.mid_period.*` (4) are in the registry with starter values; no screen sets them (Payroll rules shows only bonus, loans and reports access) |
| P4_3_ReadOnly · 4.3 Payroll policies · read-only | wire design | same |
| P4_4 · 4.4 Payslip layout | live (gap) | /yx/payroll/payslip-layout (`PayslipLayoutScreen`); PDF protection (`payroll.payslip_email`) has no screen |
| P4_4_ReadOnly · 4.4 Payslip layout · read-only | live (gap) | read-only: unsure |
| P4_5 · 4.5 Tax | wire design | `tax.regime_cutoff`, `tax.proof_window_opens` and `tax.proof_cutoff` are in the registry with starter values; no screen sets them |
| P4_5_ReadOnly · 4.5 Tax · read-only | wire design | same |
| P4_6 · 4.6 Loans & advances | live (gap) | the Loans section of /yx/settings/payroll-rules (`payroll.loan.*`) and /yx/payroll/loans (`LoansScreen`); pre-closure and pause rules: unsure |
| P4_6_ReadOnly · 4.6 Loans & advances · read-only | live (gap) | read-only: Payroll rules is read-only for payroll set-up without org.settings.manage |
| P4_7 · 4.7 Statutory set-up | live (gap) | /yx/payroll/statutory (`StatutoryHubScreen`), entity registrations on Legal entities (`PUT org/legal-entities/:id/statutory`), set-by-law values on /yx/payroll/statutory-rules (`RulesBrowserScreen`) |
| P4_7_ReadOnly · 4.7 Statutory set-up · read-only | live (gap) | read-only: unsure |
| P4_8 · 4.8 Expenses & travel | live (gap) | /yx/settings/expenses (`PolicyMatrixScreen`); 14 company choices (`expense.finance_audit`, `expense.route.*`, `expense.card.*`, `expense.advance.*`, `expense.gst.capture` and others) have no screen |
| P4_8_ReadOnly · 4.8 Expenses & travel · read-only | live (gap) | read-only: `canEdit` = expense.policy.manage; viewing with expense.policy.view |
| P4_9 · 4.9 Contract labour | live (gap) | contract-labour map: /yx/settings/contract-labour renders this designed page (`SettingsPageScreen` pageId 4.9, `GET/PUT contract-labour/settings`); the per-site checklist stays design (question 751 there) |
| P4_9_ReadOnly · 4.9 Contract labour · read-only | live (gap) | contract-labour map: without the settings key, or while acting |
| P4_9_Registration · 4.9 Contract labour · registration (CL-5) | live | contract-labour map: `RegistrationSheet` on /yx/settings/contract-labour; `POST/PUT contract-labour/registrations` |
| P4_10 · 4.10 Earned wage access | live (gap) | /yx/payroll/ewa (`EwaAdminScreen`, `EwaPolicy`); partner and fees: unsure |
| P4_10_ReadOnly · 4.10 Earned wage access · read-only | live (gap) | read-only: the page passes `canManage` |
| P4_11 · 4.11 Benefits & FBP | design only, feature not built | searched `insurance|fbp|flexible benefit|employer nps` in apps/api/src: only accidents, letter fields and the country pack; no benefits tables |
| P4_11_ReadOnly · 4.11 Benefits & FBP · read-only | design only, feature not built | as the page |

#### Group 5 · Documents & Communication

File: `packages/yx-ui/src/screens/settings/settings-g5.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 5 · Documents & Communication | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 5 · loading | live | same, loading |
| P5_1 · 5.1 Document types | design only, feature not built | `GET documents/types` lists a fixed starter list; no API adds or changes a type (searched `documentType.(create|update|upsert)`: none) |
| P5_1_ReadOnly · 5.1 Document types · read-only | design only, feature not built | as the page |
| P5_2 · 5.2 Letters | live (gap) | /yx/settings/letters (`LetterTemplatesList`: Word templates, paragraphs, preview; `letters` API); letter types and reference numbers: unsure |
| P5_2_ReadOnly · 5.2 Letters · read-only | live (gap) | read-only: unsure |
| P5_3 · 5.3 Signatories & e-sign | live (gap) | signatories on the same page (`SignatoriesDrawer`, `letter.signatory.manage`); the company DSC is a flag on letters (`companyDsc`); Aadhaar eSign: none found |
| P5_3_ReadOnly · 5.3 Signatories & e-sign · read-only | live (gap) | read-only: unsure |
| P5_4 · 5.4 Notifications | live (gap) | /yx/settings/emails (`EmailSettingsScreen`: templates, wording, branding; `notifications/email`); each person's digest and choices on /yx/me/notifications; company channel defaults and quiet hours: none found |
| P5_4_ReadOnly · 5.4 Notifications · read-only | live (gap) | read-only: support staff may open it (menu) |
| P5_5 · 5.5 WhatsApp & SMS | live (gap) | /yx/settings/sms (`SmsSettingsScreen`, `notifications/sms`: accounts, DLT, deliveries); WhatsApp only as the older candidate WhatsApp set-up (`organizations/whatsapp-config`, /v2) |
| P5_5_ReadOnly · 5.5 WhatsApp & SMS · read-only | live (gap) | read-only: unsure |
| P5_6 · 5.6 Announcements | design only, feature not built | searched `announcement` in apps/api/src: none |
| P5_6_ReadOnly · 5.6 Announcements · read-only | design only, feature not built | as the page |
| P5_7 · 5.7 Policies | live (gap) | the Company policies section of /yx/settings/company-rules (`policy.*`, `company.industry`) and /yx/desk/policy-admin (`PolicyAdminScreen`) |
| P5_7_ReadOnly · 5.7 Policies · read-only | live (gap) | read-only: `canManage` on Company rules |
| P5_8 · 5.8 Helpdesk | live (gap) | /yx/desk/setup (`DeskSetupScreen`: queues, catalogue, response times, rules, mail, knowledge-base review) |
| P5_8_ReadOnly · 5.8 Helpdesk · read-only | live (gap) | read-only: unsure |
| P5_9 · 5.9 Engage | design only, feature not built | searched `kudos|recognition` in apps/api/src: none; the growth screens (feed, rewards, recognition) are on the not-live list |
| P5_9_ReadOnly · 5.9 Engage · read-only | design only, feature not built | as the page |

#### Group 6 · Hiring & Assessments

File: `packages/yx-ui/src/screens/settings/settings-g6.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 6 · Hiring & Assessments | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 6 · loading | live | same, loading |
| P6_1 · 6.1 Hiring | live | hiring map: /yx/settings/hiring renders this designed page (`SettingsPageScreen` pageId 6.1 with `live`), `GET/PUT hiring/settings` |
| P6_1_ReadOnly · 6.1 Hiring · read-only | live | hiring map: without the edit keys every value is plain text |
| P6_1_NoAccess · 6.1 Hiring · no access | live | hiring map: the no-access state |
| P6_1_StageTargets · 6.1 Hiring · stage targets | live | `StageTargetsSheet`, `PATCH pipelines/stages/:id` (hiring settings page line 63) |
| P6_1_ScorecardEdit · 6.1 Hiring · edit scorecard | live | `ScorecardTemplateSheet`, `PUT hiring/scorecard-templates/:id` |
| P6_1_ScorecardNew · 6.1 Hiring · add scorecard | live | `POST hiring/scorecard-templates` |
| P6_1_ScorecardUsed · 6.1 Hiring · used scorecard (saved as a copy) | live | hiring map: Save as a copy |
| P6_1_ScorecardView · 6.1 Hiring · scorecard, view only | live | hiring map (it notes that live shows the rows read-only rather than the view-only sheet) |
| P6_1_StaleRecruiter · 6.1 Hiring · default recruiter no longer qualifies | live | hiring map, answer 348 |
| P6_1_NycHint · 6.1 Hiring · AI on with a New York City location | live | hiring map, answer 473 |
| P6_1_StaleBandApprover · 6.1 Hiring · approver above the range can no longer approve | live | hiring map, answer 376 |
| P6_2 · 6.2 Staffing desk | live (gap) | hiring map: /yx/settings/staffing renders this designed page (pageId 6.2, `GET/PUT staffing/settings`); gap: collections, dunning, client-portal times and e-invoicing (staffing slice 3) |
| P6_2_ReadOnly · 6.2 Staffing desk · read-only | live | hiring map: recruiters (`ats.staffing.view`) read it |
| P6_2_InvoiceSeries · 6.2 Staffing desk · add invoice series | live | hiring map: `InvoiceSeriesSheet` |
| P6_3 · 6.3 Performance | live (gap) | /yx/settings/performance (`PerformanceSetupScreen`: rating scales and review templates); 14 company choices (`perf.goal.approval`, `perf.anonymity.min_responses`, `perf.pay_band.visible` and others) have no screen |
| P6_3_ReadOnly · 6.3 Performance · read-only | live (gap) | read-only: unsure |
| P6_4 · 6.4 Learning | design only, feature not built | learning is not built: searched `course|learning` in apps/api/src (the hits are MFA enrolment only); the course screens are on the not-live list |
| P6_4_ReadOnly · 6.4 Learning · read-only | design only, feature not built | as the page |
| P6_5 · 6.5 Assessments | design only, feature not built | unsure: the older exam product has per-test APIs (`questions`, `exams`, `proctoring-retention`) used by /v2 pages, but no company-wide defaults for the question bank, delivery, proctoring or results; `ProctoringSettingsScreen` is on the not-live list |
| P6_5_ReadOnly · 6.5 Assessments · read-only | design only, feature not built | as the page |

#### Group 7 · Integrations & Developers

File: `packages/yx-ui/src/screens/settings/settings-g7.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 7 · Integrations & Developers | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 7 · loading | live | same, loading |
| P7_1 · 7.1 Integrations | wire design | connected apps and webhooks exist in the older API (`organizations/integrations/connected-apps…`, `…/webhook`, `…/webhook-deliveries`, `…/hris-config`) and only the /v2 Integrations page uses them; unsure whether those routes check the YukthiX keys (they are older) |
| P7_1_ReadOnly · 7.1 Integrations · read-only | wire design | same |
| P7_2 · 7.2 Biometric devices | live (gap) | /yx/time/setup/devices (`DevicesScreen`, `time/devices`, device punches and backfills) |
| P7_2_ReadOnly · 7.2 Biometric devices · read-only | live (gap) | read-only: unsure |
| P7_3 · 7.3 Payouts, banks & accounting | live (gap) | bank files on /yx/payroll/payment-modes (`PaymentsScreen`); the expense journal and the staffing accounting export are live in their areas; payout partner: the penny-drop provider seam has none wired (`payroll/payout.service.ts` line 557) |
| P7_3_ReadOnly · 7.3 Payouts, banks & accounting · read-only | live (gap) | read-only: unsure |
| P7_4 · 7.4 Verification | design only, feature not built | no automatic verification provider ("none is wired", `payroll/payout.service.ts` line 557); identity checks are manual (`people/identity-checks.service.ts`); hiring background checks have their own page |
| P7_4_ReadOnly · 7.4 Verification · read-only | design only, feature not built | as the page |
| P7_5 · 7.5 Calendar & chat | wire design | calendar connections exist (`calendar/connections`, `calendar/:provider/connect`; only the /v2 recruiter calendar uses them) and so do approval chat links (`workflow/channel-links`); `timesheet.tool_suggestions` has no screen |
| P7_5_ReadOnly · 7.5 Calendar & chat · read-only | wire design | same |
| P7_6 · 7.6 AI | wire design | a company AI key (`organizations/integrations/ai-key`, /v2) and AI credit use (`AiCreditUsage`, `ai/ai-invocation.service.ts`) exist; the AI switches live inside areas (Hiring 6.1, `policy.ai_writer`); no page gathers them |
| P7_6_ReadOnly · 7.6 AI · read-only | wire design | same |
| P7_7 · 7.7 Developers | wire design | API keys (`POST/DELETE organizations/integrations/api-key`), the webhook and its secret, and API usage (`organizations/api-usage`, `ApiUsageDaily`) are used only by the /v2 Integrations page |
| P7_7_ReadOnly · 7.7 Developers · read-only | wire design | same |
| P7_8 · 7.8 Analytics | design only, feature not built | searched `attrition` in apps/api/src: none |
| P7_8_ReadOnly · 7.8 Analytics · read-only | design only, feature not built | as the page |
| P7_9 · 7.9 Deepfake detection | design only, feature not built | searched `deepfake` in apps/api/src: none |
| P7_9_ReadOnly · 7.9 Deepfake detection · read-only | design only, feature not built | as the page |

#### Group 8 · Billing & Account

File: `packages/yx-ui/src/screens/settings/settings-g8.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 8 · Billing & Account | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 8 · loading | live | same, loading |
| P8_1 · 8.1 Plan & add-ons | wire design | `organizations/billing/plans`, `…/checkout`, `…/portal` (Stripe) are used only by /v2 Settings › Billing; each company's products are set by YukthiX staff in the console |
| P8_1_ReadOnly · 8.1 Plan & add-ons · read-only | wire design | same |
| P8_2 · 8.2 Usage & caps | wire design | `organizations/billing/usage`, `organizations/api-usage` and SMS deliveries (`notifications/sms/deliveries`, shown on /yx/settings/sms) exist; there is no usage page |
| P8_2_ReadOnly · 8.2 Usage & caps · read-only | wire design | same |
| P8_3 · 8.3 Invoices & payment | wire design | `organizations/billing/invoices` (Stripe) is used only by /v2 Billing |
| P8_3_ReadOnly · 8.3 Invoices & payment · read-only | wire design | same |
| P8_4 · 8.4 Sandbox | design only, feature not built | searched `sandbox` in apps/api/src: only Content-Security-Policy headers |
| P8_4_ReadOnly · 8.4 Sandbox · read-only | design only, feature not built | as the page |
| P8_5 · 8.5 Data export & closure | design only, feature not built | searched `close.?account|tenant.close|whole.?company export` in apps/api/src: none (closing a company is staff-only, in the console) |
| P8_5_ReadOnly · 8.5 Data export & closure · read-only | design only, feature not built | as the page |
| P8_6 · 8.6 Analytics, status & tips | live (gap) | the maintenance banner is live (`GET /availability`, console C-5); What's new and tours have company switches on Company rules (`help.whats_new.show`, `help.tours.show`); product analytics and a status page: none |
| P8_6_ReadOnly · 8.6 Analytics, status & tips · read-only | live (gap) | read-only: `canManage` on Company rules |

## 5. What can be reused, and what is missing

Reuse (never a second version):

- **The designed settings page** (`SettingsPageScreen` with `live`, `screens/settings/settings-screens.tsx`): values,
  starter-default chips, set-by-law rows, "Different for" overrides (answer 495), the unsaved-changes guard, the
  "confirm it's you" step for sensitive fields, read-only by key, the toast on save, loading and error. Each live page
  has a small builder that turns the API's values into the drawn page (`hiring-live.ts`, `staffing-live.ts`,
  `visitors-live.ts`, `contract-labour-live.ts`): new pages copy that pattern.
- **The settings registry** (`settings-registry.ts`, `GET/PUT/DELETE org/settings`, `settings/resolve`): every key has
  a starter value, allowed scopes (company down to employee), dated values, a guard key for access and fraud settings,
  and audit. Pages that only show registry keys need no new API.
- **The page list** (`SETTINGS_GROUPS`, 71 pages with synonyms) for the home, search and group pages.
- **The area editors** (leave types, policies, holidays, shifts, components, templates, payslip layout, statutory hub,
  letters, emails, SMS, desk set-up, roles, security, legal entities, locations, structure): a settings page links to
  them ("Open …", the `link` setting kind), it does not redraw them.
- **Audit log** (`GET audit-logs`) for change history; **approvals engine** (`workflow/approvals-engine.service.ts`) for
  approval policies and a second approver.

Missing (to build): the settings home and group pages; screens for 105 registry keys; a page's change history; a second
approver for payroll settings; approval policies per request type; and the not-built features listed in section 3.

## 6. Questions for the founder (before building)

1321. **Two drawn formats for the same settings.** The settings map draws every page in one shared format (71 pages).
      Separately, Legal entities, Locations, Structure, Company rules, Access and privacy, Payroll rules, Countries,
      Translations and Security are drawn as their own screens, and those are the live ones. So 1.2 to 1.4, 2.3 and
      parts of 1.1 are drawn twice, and about 40 settings shown on Company rules, Access and privacy and Payroll rules
      are also drawn on settings-map pages. *Suggested: one home for each setting. The settings-map page is the front
      door (Settings › group › page, with search). The rich editors that are live (legal entities, locations, structure,
      security, leave types, shifts and so on) stay as they are and the settings page links to them. The settings now on
      Company rules, Access and privacy and Payroll rules move to their settings-map page (each setting on exactly one
      page), and those three pages are retired once nothing is left on them.*
1322. **Settings home and group pages.** *Suggested: build the drawn Settings home (search across every setting, by
      plain words such as "probation" or "PF ceiling") and the eight group pages. Settings in the menu opens the home.
      People see only the pages they may open.*
1323. **105 company settings with no screen.** Leave, attendance, roster, kiosk, payroll, tax, exit, rehire, expenses and
      performance choices work today with YukthiX's starter value, but HR cannot see or change them. *Suggested: show
      every one on its drawn settings page, with "Starter default" beside it, before any new feature. This is the first
      thing to build after the home.*
1324. **Legal minimum and maximum.** *Suggested: the floor or ceiling comes from the country's rule set (set by
      YukthiX), not typed into each page. The page blocks saving below it (or above it) and names the Act, as drawn. A
      company may always be more generous than the law.*
1325. **Second person for payroll settings.** The drawing asks a second person to approve any payroll setting change;
      today it saves at once. *Suggested: a company setting "Payroll setting changes need a second person", on by
      default. The person who made the change cannot approve it. It covers group 4 pages; other pages save at once.*
1326. **Change history on every page.** *Suggested: each settings page shows its last 20 changes (who, when, before and
      after) from the audit log, to anyone who may open the page.*
1327. **Integrations, developers and billing.** Their APIs exist but only the older /v2 pages use them, and those routes
      predate the YukthiX keys. *Suggested: first check each older route for the right key, company isolation and the
      security-key check on risky actions (API keys, webhooks, AI key). Then wire the drawn group 7 and 8 pages to them
      and retire the /v2 org-admin pages.*
1328. **Billing pages.** *Suggested: Plan & add-ons, Usage & caps and Invoices first show what the company has, read
      only (the plan and products YukthiX staff set in the console, usage counters, invoices). Paying online comes later,
      once the payment provider for Indian customers (GST invoices) is chosen.*
1329. **Settings for features not built yet.** Customisation builders, rules and automations, asset categories,
      partners, benefits and FBP, announcements, Engage, learning, assessments, verification, analytics, deepfake
      detection and sandbox. *Suggested: each settings page is built with its feature, never before.*
1330. **Approval policies (2.4).** Every customer needs to choose who approves what. *Suggested: build 2.4 on the
      existing approvals engine: for each request type, the approval steps (manager, then HR, and so on), a reminder
      after 24 hours and escalation after 48 hours by default, each changeable per company. Hiring's approval routes
      move onto this page later.*
1331. **Document types (5.1).** *Suggested: HR can add the company's own document types and choose, per type, whether it
      must be verified and when to remind before it expires. YukthiX's starter types stay and cannot be deleted.*
1332. **Data export and closing the account (8.5).** *Suggested: a System Admin can download a whole-company export
      (asks for the security key, audited, the link works 24 hours) and ask to close the account; closing needs YukthiX
      staff and keeps the data 30 days before deleting it. Both periods are platform settings with those defaults.*
1333. **View-only pages.** Many live set-up pages open only for the people who may change them; the drawing shows
      everyone with the view key a read-only page. *Suggested: anyone who may see a settings page sees it read-only, as
      drawn; only the change key edits.*
1334. **Custom domain and data region (1.1).** *Suggested: later. The data region chosen at sign-up is shown read-only
      with "Request a region move"; custom domains come with white-label in the plan.*
1335. **Assessments (6.5).** The older exam product's question bank, tests and proctoring APIs exist and serve the /v2
      pages. *Suggested: decide first whether assessments stay a YukthiX product; if yes, wire 6.5 to those APIs after
      the same security check as 1327; if not, leave it drawn only.*

## S-1 as built (answers 1321, 1322; branch `feat/yukthix-settings-s1`)

- **/yx/settings** renders the drawn `SettingsHomeScreen` with `live`, and **/yx/settings/<group>** (for example
  `/yx/settings/time-and-leave`) the drawn `SettingsGroupScreen`. Both are off the design-live guard's not-live list.
- **Settings in the menu opens the home:** the Settings area's first link is "All settings" (`/yx/settings`), for anyone
  who may open at least one settings page; an employee with none has no Settings menu, and the home says no access.
- **A person sees only the pages they may open:** each drawn page has its live editors in order
  (`SETTINGS_PAGE_EDITORS`, `apps/web/lib/yx-nav.ts`, 44 of the 71 pages); a page shows when the viewer's own menu holds
  one of them, and leads to the first. So the grants are the menu's (the API still checks every call). A payroll-only
  admin sees Payroll & Statutory (and Payouts) only; an unknown group or one with nothing to open says no access.
- **Front door, never a second copy:** every page row, card link and search result links to the live editor, which
  stays as it is. Pages with no live editor yet (2.4, 2.7, 4.3, 4.5, groups 7 and 8 mostly, the not-built
  features) are not listed until their slice builds them.
- **Fits 1278 x 635:** measured by script in Storybook (`HomeLive`, `HomeLiveSearch`, `HomeLivePayroll`, `GroupLive`,
  msedge at 1278 x 635): no page or content scroll; the last card ends at 589 px of 635, the "probation" results at
  604, the group page at 577. To fit, the live home puts the search box in the header and lists each group's first four
  pages with "+N more" to the group page; the group page shows tiles in three columns, the summary at most two lines.
- **Tests:** web `yx-settings-home.test.tsx` (every front door names a drawn page and a page of the full menu; an
  employee sees nothing and no Settings menu; a payroll-only admin sees no People & Access page, search finds nothing
  there and the group says no access; search finds "probation" and opens Company rules; each link opens the live
  editor; the group page links; loading never flashes no access) and `yx-nav.test.ts` (All settings first). Kit suite
  and the design-live guard.

### Questions (from 1461)

1461. **Recently changed on the home.** The drawing shows the last changes across settings; the live home leaves it out
      (it would need the audit log for every page). *Suggested: add it with 1326 (each page's last 20 changes), from the
      audit log, only for pages the viewer may open.*
1462. **"Not reviewed yet" and the set-up alert.** Both are drawn on the home; the starter count needs the hidden settings
      on screens first (1323) and the alert needs the set-up hub's count. *Suggested: add both once S-2 to S-7 show the
      settings; until then they stay out rather than show made-up numbers.*
1463. **Search opens the page, not the field.** A result opens the live editor at its top; the drawn "field highlighted"
      (`PageFromSearch`) works only on the shared settings page. *Suggested: highlight the field on the four shared pages
      now and on each page as S-2 to S-7 move settings there; the older editors open at the top.*
1464. **More than one page of results.** A broad word (for example "leave") can return more results than fit on one
      screen; that list scrolls. *Suggested: keep (it is content that needs the room), sorted best match first.*
1465. **Home on a phone.** The home and group pages work at phone width but the phone app has no Settings tab.
      *Suggested: keep settings a desktop task; the phone keeps Me › Language and notification choices.*

## S-2 as built (answers 1323, 1324; branch `feat/yukthix-settings-s2`)

- **Walk fixes from S-1:** on the home, "+N more" stays on the title's first line and every card in a row starts its
  links at the same height (the cards share the row's title height, CSS subgrid); the header search says "Search, e.g.
  probation" and fits its box (137 of 152 px). Measured at 1278 x 635: link lists start at 254 and 448 px in both rows;
  no scroll.
- **The Time & Leave pages, live:** /yx/settings/time/<page> renders the drawn `SettingsPageScreen` for 3.2 Check-in &
  devices, 3.3 Shifts & patterns, 3.4 Weekly offs, 3.5 Late & regularisation, 3.6 Leave types, 3.8 Holiday calendars,
  3.9 Leave year and 3.11 Projects & timesheets (`timeSettingsPage`, `TIME_SETTINGS`). Each is the front door of its page
  (Settings home, group page and search lead there first) and keeps the drawn links to the live editors (shift editor,
  roster, leave types, year end, holidays, devices, geofences, projects), shown when the viewer's menu has them.
- **1323, every hidden setting has a field:** the 40 leave, attendance, roster, kiosk and field settings that worked with
  their starter value and had no screen each sit on one drawn page, in the drawn section they belong to (a "Field staff
  tracking" section is added on 3.2). Each shows "Starter default" until HR changes it, and "own value at N places
  (Company rules)" when a legal entity or location has its own. Saving is `PUT org/settings` company-wide, one per
  setting: HR's settings key (org.settings.manage), the access key too for phone binding and kiosk PIN tries; audited
  `org.setting.changed` with before and after.
- **1324, legal limits:** a new rule set `IN.SETTINGS.LIMITS` (migration `202617z0000111`, YukthiX's, marked verify):
  at most 9 hours of shifts a day (Factories Act, 1948 s.54), 48 a week (s.51), a 10.5-hour spread-over (s.56), and at
  least 1 weekly off (s.52). `GET org/settings` returns the limits; the page shows "Legal maximum: 48 (Factories Act,
  1948 s.51)" and blocks saving past it; the API refuses it too ("... can be at most 48 by law (Factories Act, 1948
  s.51). Choose 48 or less."). The limit itself and anything more generous are saved.
- **Page scroll at 1278 x 635** (Storybook `TimeLive`, all eight pages): 3.4, 3.8, 3.9 and 3.11 fit (578 of 578);
  3.5 needs 895 px, 3.2 1616, 3.6 1546 and 3.3 1520: 8 to 10 settings with their help and legal lines need the room
  (question 1481).
- **Tests:** API e2e `settings-s2-limits` (the hidden settings and the limits are listed; 54 hours, no weekly off and a
  12-hour spread-over refused naming the Act, nothing saved; 48 and 45 hours, 2 weekly offs and a comp-off change saved
  and audited with before and after; a Time admin without the company settings key and anyone else refused) and unit
  `org-settings-limits.spec`. Kit `time-settings-live.test` (all 40 settings once each with Starter default; toggles,
  several choices and months; the guarded ones locked without the access key; the page refuses 54 and no weekly off
  naming the Act and saves 45; view only without the key). Web `yx-settings-time.test` (reads and saves through
  `/org/settings`, the API refusal stays on the page, the drawn link opens the shift editor, view only, unknown page)
  and the S-1 tests updated (the Time & Leave front doors).

### Questions (from 1481)

1481. **Long settings pages scroll.** Four Time & Leave pages need more than one screen (8 to 10 settings each).
      *Suggested: keep one column with the save bar fixed at the bottom (the page is a form people read top to bottom);
      if HR finds it long, show the page's sections as tabs.*
1482. **State rules on working hours.** The limits are the Factories Act's; shops and offices follow each state's
      Shops and Establishments Act (Karnataka allows a 12-hour spread-over, for example). *Suggested: a state rule set
      can narrow or widen a limit per location's state; until then the Factories Act limits apply to every location.*
1483. **Choices past the law.** The lists still offer 54 and 60 hours a week (refused when saved). *Suggested: keep
      them listed for companies with a state exemption once 1482 is built; for now the page says why on save.*
1484. **Values per location on these pages.** A location's own value is named ("own value at 2 places") and changed on
      Company rules. *Suggested: move "Different for" (answer 495) onto these pages in S-7, when Company rules retires.*
1485. **Who changes Time & Leave settings.** Today HR's company settings key; Time admins (leave settings key) can open
      the editors but not these settings. *Suggested: let the leave settings key change the leave settings (3.6, 3.8,
      3.9) and keep attendance and roster limits with HR.*

## 7. Build plan (slices, max 3 builders at once)

Ordered by what every customer needs first: the way in (home), the everyday HR rules (time, leave, payroll, people),
then approvals, then the rest.

| slice | what | reuses | size | rough estimate |
|---|---|---|---|---|
| S-1 | Settings home, search and the eight group pages; Settings in the menu opens the home (1322) | `SettingsHomeScreen`, `SettingsGroupScreen`, `SETTINGS_GROUPS`, permissions | M | 4 days |
| S-2 | Time & Leave pages wired: 3.1, 3.2, 3.3, 3.5, 3.6 company choices, 3.9, 3.10 with the 40 leave, attendance, roster, kiosk and field keys; legal floors from the rule set (1323, 1324) | `SettingsPageScreen` live, registry, statutory rule store, time editors as links | L | 8 days |
| S-3 | Payroll pages wired: 4.3, 4.4 PDF protection, 4.5, 4.6 (loans move from Payroll rules); the second person for payroll changes (1323, 1325) | registry, approvals engine | M | 6 days |
| S-4 | People pages wired: 2.5, 2.6, 2.7 (exit, rehire, absconding, retirement), 2.9, 2.10 (audit retention); keys move off Company rules and Access and privacy (1321, 1323) | registry, `CompanySettingsScreen` override editor ideas | M | 5 days |
| S-5 | Change history on every page and view-only pages for the view key (1326, 1333) | audit log | S | 3 days |
| S-6 | Approval policies 2.4 (1330) | approvals engine, delegation | M | 6 days |
| S-7 | Organisation pages: 1.1 (language, email sender, read-only region), 1.2 to 1.6 as front doors linking the live editors; retire the three registry pages once empty (1321, 1334) | live org editors | M | 4 days |
| S-8 | Expenses 4.8 and Performance 6.3 company choices; 5.4 company channels; 5.1 document types (1323, 1331) | registry, documents API | M | 5 days |
| S-9 | Billing 8.1 to 8.3 read-only, 8.6, and data export and closure 8.5 (1328, 1332) | billing API, console plans, usage counters | M | 6 days |
| S-10 | Security check of the older integration routes, then 7.1, 7.5, 7.6, 7.7; retire /v2 org-admin pages (1327) | connected apps, webhooks, API keys, calendar, AI key | L | 8 days (2 builders) |
| S-11 | With their features, later: 1.7, 1.8, 2.8, 2.11, 4.11, 5.6, 5.9, 6.4, 6.5, 7.4, 7.8, 7.9, 8.4 (1329, 1335) | | L | with each feature |

Order (at most three builders at once):

1. Wave 1: S-1, S-2 and S-3.
2. Wave 2: S-4, S-5 and S-6.
3. Wave 3: S-7, S-8 and S-9.
4. Wave 4: S-10 (two builders).
5. Later: S-11, feature by feature.

Every slice uses only kit parts (new needs go into the kit first), keeps company isolation and the guard keys, audits
every write, shows the starter value as a default the company can change, and adds positive and negative tests and an
e2e suite.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every story of
every `Screens/Settings/` file has exactly one row, in file order, under the heading that is its title after the prefix,
with one of the five verdicts. Adapted from `console-design-map.md`; the files and the grouping differ, and a title
spread over several files would be read in file-name order (none is today).

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/settings-design-map.md and checks that every
// story under Screens/Settings/ has exactly one row, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const path = require('path');
const PREFIX = 'Screens/Settings/';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const want = {};
for (const f of walk('packages/yx-ui/src').filter((f) => f.endsWith('.stories.tsx')).sort()) {
  const src = fs.readFileSync(f, 'utf8');
  const t = /title:\s*'([^']+)'/.exec(src)?.[1];
  // Capital first letter only: lower-case exports would be sample props. One title may span several files.
  if (t?.startsWith(PREFIX)) (want[t.slice(PREFIX.length)] ??= []).push(...[...src.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]));
}
const doc = fs.readFileSync('docs/yukthix/settings-design-map.md', 'utf8');
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

The registry-key search behind section 3 (`node keys.js` from the repo root; prints the keys no web or kit file names):

```js
// Lists settings-registry keys that no file in apps/web or packages/yx-ui/src names, outside tests, stories, e2e and
// the kit's settings-map sample data. A key a page builds from parts, or names under another field, is a false hit.
const fs = require('fs');
const path = require('path');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (['node_modules', '.next'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const skip = (f) => /\.test\.|\.stories\.|e2e/.test(f) || /registry-g\d/.test(path.basename(f));
const text = [...walk('apps/web'), ...walk('packages/yx-ui/src')].filter((f) => /\.tsx?$/.test(f) && !skip(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const reg = fs.readFileSync('apps/api/src/org-structure/settings-registry.ts', 'utf8');
const keys = [...reg.matchAll(/^\s+'([a-z_]+\.[a-z0-9_.]+)':/gm)].map((m) => m[1]);
const missing = keys.filter((k) => !text.includes(k));
console.log(`${keys.length} keys, ${missing.length} named nowhere:`);
console.log(missing.join(' '));
```

## Founder approved (12 Nov 2026, "ok for all")
1321 to 1335 approved as suggested. Waves: S-1 to S-3 first (S-1 started), then S-4 to S-6, then S-7 to S-9, then S-10; S-11 with each feature. 1335: founder to decide whether assessments stay a YukthiX product before 6.5 is wired.

- 1461 to 1465 approved as suggested (12 Nov 2026, "Ok for all"): recently changed with 1326; not-reviewed count and set-up alert after the hidden settings are on screens; field highlight on the four shared pages now and per page later; long search results may scroll; settings stay a desktop task.
