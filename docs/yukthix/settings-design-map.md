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

After S-1 (Settings home, search and the eight group pages live; four live stories added) S-2 (the Time & Leave pages with their settings; one live story added) S-3 (the Payroll pages, a second person for payroll changes; two live stories added) and S-4 (2.7 and 2.10 with their settings; one live story added) and S-5 (page history live; appendix script "ok"), and S-8 (13 Nov 2026: the retired Company rules, Access and privacy and Payroll rules stories deleted, answer 1781; 4.8, 5.1, 5.4 and 6.3 live; four 5.1 stories added; appendix script "ok"), and S-9 (group 8 live: 8.1 to 8.3 read-only, 8.5; six live stories added; appendix script "ok").

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Settings home and page states | 1 | 18 | 3 | 3 | 0 | 0 | 24 |
| B. Organisation and Global core | 2 | 11 | 0 | 0 | 0 | 0 | 11 |
| C. Settings map, groups 1 to 8 | 8 | 44 | 105 | 8 | 26 | 0 | 183 |
| **All A-C** | **11** | **73** | **108** | **11** | **26** | **0** | **218** |

Per group (C):

| group | live | live, gap | wire design | feature not built | stories |
|---|---|---|---|---|---|
| Group 1 · Organisation | 2 | 12 | 0 | 4 | 18 |
| Group 2 · People & Access | 3 | 18 | 0 | 4 | 25 |
| Group 3 · Time & Leave | 3 | 24 | 0 | 0 | 27 |
| Group 4 · Payroll & Statutory | 5 | 20 | 0 | 2 | 27 |
| Group 5 · Documents & Communication | 6 | 14 | 0 | 4 | 24 |
| Group 6 · Hiring & Assessments | 15 | 3 | 0 | 4 | 22 |
| Group 7 · Integrations & Developers | 2 | 4 | 8 | 6 | 20 |
| Group 8 · Billing & Account | 8 | 8 | 0 | 2 | 20 |

Counted by script 13 Nov 2026 on `feat/yukthix-settings-s9` (the script is in the appendix). There are 218 stories in
11 files whose title starts `Screens/Settings/`, one file per title (checked: no title spans two files):
`screens/settings/settings-home.stories.tsx` (24), `screens/global/global.stories.tsx` (3),
`screens/org/org.stories.tsx` (8) and `screens/settings/settings-g1.stories.tsx` to `settings-g8.stories.tsx`
(18, 25, 27, 27, 24, 22, 20, 20). Story names are the exported names that start with a capital letter. None is a phone
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
| /yx/settings/company-rules | retired in S-7: redirects to /yx/settings | none | its settings are on 1.1, 1.5, 1.6, 2.5, 2.6, 2.7, 2.9, 3.1, 3.3, 5.7 and 8.6 |
| /yx/settings/access-settings | retired in S-7: redirects to /yx/settings/people/directory-and-privacy | none | its settings are on 2.1, 2.2, 2.3 and 2.10; the erasure dry run is on 2.2 |
| /yx/settings/payroll-rules | retired in S-7: redirects to /yx/settings/payroll/loans-and-advances | none | its settings are on 4.6 |
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
(2), change history (1), and the pages whose settings are in the API with no screen: 7.1, 7.5, 7.6,
7.7, 8.1, 8.2, 8.3.

**Registry keys with no screen** (105; exact-key search over `apps/web` and `packages/yx-ui/src`, with tests, stories,
e2e and the kit's settings-map sample data left out; `help.page_help` left out by hand, see above):

- Leave (13) and attendance, roster, kiosk and field (27): on their Time & Leave pages since S-2 (answer 1323, see "S-2 as built").
- Safety and disputes (4): `accident.injury_types`, `accident.injury_leave_type`, `accident.contractor_reminder_days`,
  `dispute.lawyer_may_approve`.
- Payroll and tax (16): on the Payroll & Statutory pages since S-3 (answer 1323, see "S-3 as built").
- People lifecycle and audit (15): on 2.7 and 2.10 since S-4 (answer 1323, see "S-4 as built").
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
| Home · Settings home | live | S-1: /yx/settings renders `SettingsHomeScreen` with `live`: only the pages the viewer may open (those whose live editor is in their menu, `SETTINGS_PAGE_EDITORS` in `apps/web/lib/yx-nav.ts`), each linking to its live editor. S-5 (answer 1461): Recently changed is live (the last three changes on pages the viewer may open, each to its page; Audit log for audit.view). The starter count and set-up alert stay out (question 1462) |
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
| PagePayrollApproval · Page · payroll change needs a second approver | live (gap) | S-3 (answer 1325): live on the payroll pages: "Send for approval" with the change summary, then "Waiting for a second person" with Approve and Reject (Withdraw for the person who asked); `setting_change_requests`, never the one who asked (service and a database check). Gap: the drawn example field (`pay.protected_net`) has no setting; the drawn employee count is not shown live |
| PageSaveFailed · Page · save failed (edits kept) | live | the live save shows the refusal and keeps the edits (`settings-screens.tsx` around line 425) |
| PageSecurity · Page · security change asks to confirm | live (gap) | the "confirm it's you" step works on live pages for `sensitive` fields (3.12 watch-list); the drawn example is 2.3 Security, whose live page is `SecuritySettingsScreen` instead |
| PageScopeOverride · Page · editing overrides for a location | live (gap) | "Different for" values are live on 6.2 per legal entity (answer 495, `staffingEntityChanges`) and visitors shows own values per location; the drawn example (3.1 per location) is not wired |
| PageHistory · Page · change history | live | S-5 (answer 1326): the S-2, S-3 and S-4 pages and 3.11 show "Last changed by" and View history with the last 20 changes (who, role, when, where, before and after) from the audit log (`GET org/settings/history`, only settings the viewer may read) |
| PageReadOnly · Page · read-only (no permission) | live | read-only by key works on the live pages; S-5 (answer 1333): Time admins open every Time & Leave page (the attendance ones read-only) and HR who read the structure open 2.7 and 2.10 read-only; the API refuses their saves. The drawn example (4.7) is not wired |
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
| ErasureDryRun · Erasure Dry Run | live | /yx/settings/people/directory-and-privacy (2.2) renders `ErasureCard` from `GET people/privacy-erasure` (moved out of the retired Access and privacy screen, answer 1781) |
| ErasureOnDue · Erasure On Due | live | same card, on, with people due and one not done |

### C. Settings map, groups 1 to 8

#### Group 1 · Organisation

File: `packages/yx-ui/src/screens/settings/settings-g1.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 1 · Organisation | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 1 · loading | live | same, loading |
| P1_1 · 1.1 Company & branding | live (gap) | S-7 (answer 1321): /yx/settings/org/company-and-branding: the normal working week (different for entity or location) and the people language; still elsewhere: language per entity on /yx/settings/countries, company words on /yx/settings/translations, email logo and wording on /yx/settings/emails. Gap: logo, colours and company profile fields are not on the page |
| P1_1_ReadOnly · 1.1 Company & branding · read-only | live (gap) | View only without HR's settings key (org.settings.manage) |
| P1_2 · 1.2 Legal entities | live (gap) | /yx/settings/legal-entities renders `LegalEntitiesScreen` (drawn under Settings/Organisation; `org/legal-entities…`, `…/statutory`); this settings-map version is not rendered: a second design of the same page |
| P1_2_ReadOnly · 1.2 Legal entities · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P1_3 · 1.3 Locations | live (gap) | /yx/settings/locations renders `LocationsScreen` (`org/locations`); geofence and networks on /yx/time/setup/locations (`GeofenceEditorScreen`, `time/setup/locations/:id/points`, `…/networks`); this settings-map version is not rendered |
| P1_3_ReadOnly · 1.3 Locations · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P1_4 · 1.4 Structure masters | live (gap) | /yx/settings/structure renders `StructureScreen` (`org/masters/:kind`, grade pay ranges); this settings-map version is not rendered |
| P1_4_ReadOnly · 1.4 Structure masters · read-only | live (gap) | read-only: `canManage`; pay ranges by `pay.range.manage` |
| P1_5 · 1.5 Employee records | live (gap) | S-7 (answer 1321): /yx/settings/org/employee-records: required personal details and the work-permit reminder; custom fields stay on /yx/settings/custom-fields, the employee-code rule on Legal entities |
| P1_5_ReadOnly · 1.5 Employee records · read-only | live (gap) | View only without HR's settings key |
| P1_6 · 1.6 Set-up hub | live (gap) | /yx/settings/setup-hub renders `SetupHubScreen` (`GET help/setup-hub`, Help H-6; the Go-live section is left out, help map question 1011); S-7 (answer 1321): its two switches on /yx/settings/org/set-up-hub |
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
| P2_1 · 2.1 Roles & access | live (gap) | /yx/settings/access renders `RolesAccessScreen` (`access` API); S-7 (answer 1321): access requests and the special-permission confirmation on /yx/settings/people/roles-and-access |
| P2_1_ReadOnly · 2.1 Roles & access · read-only | live (gap) | read-only: unsure; Roles & access is in the menu only for `access.role.manage` |
| P2_2 · 2.2 Directory & privacy | live (gap) | S-7 (answer 1321): /yx/settings/people/directory-and-privacy: manager access, team pay access, who accessed my data, retention, special-data erasure (with the erasure dry run) and net pay on Home. Gap: directory visibility, transparency, external logins and privacy notices are not built |
| P2_2_ReadOnly · 2.2 Directory & privacy · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P2_3 · 2.3 Security | live (gap) | /yx/settings/security renders `SecuritySettingsScreen` (`security/policy`), plus /yx/settings/identity-providers and /yx/settings/support-access; S-7 (answer 1321): the bank-change cooling hours on /yx/settings/people/security |
| P2_3_ReadOnly · 2.3 Security · read-only | live (gap) | read-only: unsure; Security is in the menu for admin roles only |
| P2_4 · 2.4 Approvals | live (gap) | S-6 (answer 1330): /yx/settings/people/approvals: the drawn page with the policies per request type (read-only list from `GET workflow/policies`, the link to the policy editor) and the reminder and escalation hours (company settings, 24 and 48 by default). Gap: the drawn default mode, escalate-to, automatic decisions, out-of-app approval, risk levels, approve-with-changes, duplicate approver and leave delegation fields are not on the page (questions 1761 to 1764) |
| P2_4_ReadOnly · 2.4 Approvals · read-only | live (gap) | same page read-only for those who read the company settings; the API refuses their changes |
| P2_5 · 2.5 Onboarding & probation | live (gap) | S-7 (answer 1321) and 1561: /yx/settings/people/onboarding-and-probation: probation (length, most it may run, review lead days, automatic confirmation) and the joining day (reporting time, what to bring); journey templates stay on /yx/settings/checklists. Gap: pre-boarding settings: none found |
| P2_5_ReadOnly · 2.5 Onboarding & probation · read-only | live (gap) | View only without HR's settings key |
| P2_6 · 2.6 Job changes & transfers | live (gap) | S-7 (answer 1321) and 1561: /yx/settings/people/job-changes-and-transfers: back-dated changes, what a promotion must change, the inter-entity transfer defaults and pay ranges. Gap: change types and deputation: none found |
| P2_6_ReadOnly · 2.6 Job changes & transfers · read-only | live (gap) | read-only: `canManage` = org.settings.manage |
| P2_7 · 2.7 Exit & lifecycle policies | live (gap) | S-4: /yx/settings/people/exit-and-lifecycle-policies (`PEOPLE_SETTINGS`): the two notice periods (dated: a change applies from today), retirement age and alert, VRS days, the absconding timeline, alumni access and a Rehire section (7 settings), each Starter default until changed; Related: Company rules (fixed-term contracts). Gap: the drawn notice table, buy-out, offboarding templates, clearance departments, sabbatical and death support have no setting yet |
| P2_7_ReadOnly · 2.7 Exit & lifecycle policies · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; the audit log length also needs the access key |
| P2_8 · 2.8 Assets | design only, feature not built | the asset register is live (/yx/people/assets, `lifecycle/assets`), but `Asset.category` is free text and there are no issue or return rules; no API for the drawn categories or rules |
| P2_8_ReadOnly · 2.8 Assets · read-only | design only, feature not built | as the page |
| P2_9 · 2.9 Employee relations & cases | live (gap) | S-7 (answer 1321) and 1561: /yx/settings/people/employee-relations-and-cases: speak-up, case reply days and the regulated declarations; /yx/desk/speakup-setup links here. Gap: the Internal Committee (POSH) and retention parts: unsure |
| P2_9_ReadOnly · 2.9 Employee relations & cases · read-only | live (gap) | View only without HR's settings key |
| P2_10 · 2.10 Audit & data retention | live (gap) | S-4: /yx/settings/people/audit-and-data-retention: how long the audit log is kept (legal minimum 8 years, Companies (Accounts) Rules 2014 r.3(1); the access key too); Related: Access and privacy, where the personal-data retention and erasure still are. Gap: the retention schedule table, data-subject requests (only the service desk's) and the audit log link (no company audit log page in /yx yet) |
| P2_10_ReadOnly · 2.10 Audit & data retention · read-only | live (gap) | read-only: without HR's settings key (org.settings.manage) the page is View only; the audit log length also needs the access key |
| P2_11 · 2.11 Partners | design only, feature not built | the partner programme is not built (console map D, YX-06 to YX-08); searched `partner.?link|partner.?firm`: none |
| P2_11_ReadOnly · 2.11 Partners · read-only | design only, feature not built | as the page |
| PeopleLive · People page · live with the company settings (S-4) | live | 2.7 and 2.10 with sample company values (`page` 0 or 1): Starter default, the dated notice periods, the audit log's legal minimum, the Related link |

#### Group 3 · Time & Leave

File: `packages/yx-ui/src/screens/settings/settings-g3.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 3 · Time & Leave | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 3 · loading | live | same, loading |
| P3_1 · 3.1 Attendance modes | live (gap) | S-7 (answer 1321): /yx/settings/time/attendance-modes: the attendance mode, the missing-punch effect and the Factories Act switch (dated, with Applies from; different for location) |
| P3_1_ReadOnly · 3.1 Attendance modes · read-only | live (gap) | View only without the time settings key |
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
| P3_11 · 3.11 Projects & timesheets | live (gap) | /yx/settings/projects (Projects P-1, `projectSettingsPage`) is the one 3.11: the Projects switch, the booking rule, the burn alerts and, since the S-2 follow-up, "Timesheet pre-fill" (`timesheet.tool_suggestions`, off by default, answer 1409; read and saved through /org/settings with HR's settings key); link to Projects. Gap: approvals, utilisation target and the work tool connectors |
| P3_11_ReadOnly · 3.11 Projects & timesheets · read-only | live (gap) | read-only: Projects managers read it (projects API); the pre-fill switch is locked without HR's settings key and hidden from someone who cannot read the company settings |
| P3_12 · 3.12 Visitors | live (gap) | visitors map: /yx/settings/visitors renders this designed page (`SettingsPageScreen` pageId 3.12, `GET/PUT visitors/settings`); its gap is listed there |
| P3_12_ReadOnly · 3.12 Visitors · read-only | live (gap) | visitors map: reception reads it |
| TimeLive · Time & Leave page · live with the company settings (S-2) | live | the seven S-2 pages with sample company values (`page` 0 to 6): Starter default chips, legal maximums and minimums naming the Act, the drawn editor links |

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
| P4_3 · 4.3 Payroll policies | live (gap) | S-3: /yx/settings/payroll/payroll-policies renders this page (`SettingsPageScreen` with `live`, `PAY_SETTINGS`): net pay checks, rounding, standard hours (legal maximum 9, Factories Act s.54), encashment basis, the protected share, notice shortfall, one-time pay approval, a Mid-month changes section (4 settings) and "Payroll setting changes need a second person" (on by default, answer 1325). Gap: day basis, deduction cap, holds, payment, maternity and bonus fields have no setting yet |
| P4_3_ReadOnly · 4.3 Payroll policies · read-only | live (gap) | read-only: payroll set-up (payroll.setup.manage) reads it, View only (payroll never changes policy, MT-PAY-B-07); HR's settings key changes it, through a second person |
| P4_4 · 4.4 Payslip layout | live (gap) | S-3: /yx/settings/payroll/payslip-layout (menu: Payslip settings): emailing payslips as protected PDFs and a Keeping pay documents section (at least 8 years, Companies Act 2013 s.128(5)); the drawn link opens the layout editor (/yx/payroll/payslip-layout, `PayslipLayoutScreen`). Gap: the password format |
| P4_4_ReadOnly · 4.4 Payslip layout · read-only | live (gap) | read-only: payroll set-up (payroll.setup.manage) reads it, View only (payroll never changes policy, MT-PAY-B-07); HR's settings key changes it, through a second person |
| P4_5 · 4.5 Tax | live (gap) | S-3: /yx/settings/payroll/tax: the regime choice deadline and the proof window (dates read "31 May"). Gap: default regime, declaration window, joiner days, landlord PAN and reminders have no setting yet |
| P4_5_ReadOnly · 4.5 Tax · read-only | live (gap) | read-only: payroll set-up (payroll.setup.manage) reads it, View only (payroll never changes policy, MT-PAY-B-07); HR's settings key changes it, through a second person |
| P4_6 · 4.6 Loans & advances | live (gap) | S-7 (answer 1321) and 1521: /yx/settings/payroll/loans-and-advances: statutory bonus (11), loans and advances (4) and payroll reports access; changes wait for a second person while the switch is on; loans themselves on /yx/payroll/loans. Gap: pre-closure and pause rules: unsure |
| P4_6_ReadOnly · 4.6 Loans & advances · read-only | live (gap) | payroll set-up reads it (View only, no Approve) |
| P4_7 · 4.7 Statutory set-up | live (gap) | /yx/payroll/statutory (`StatutoryHubScreen`), entity registrations on Legal entities (`PUT org/legal-entities/:id/statutory`), set-by-law values on /yx/payroll/statutory-rules (`RulesBrowserScreen`) |
| P4_7_ReadOnly · 4.7 Statutory set-up · read-only | live (gap) | read-only: unsure |
| P4_8 · 4.8 Expenses & travel | live (gap) | S-8 (answer 1323): /yx/settings/finance/expenses-and-travel: the 14 company expense choices (`expense.*`), the link to the policy matrix (/yx/settings/expenses, `PolicyMatrixScreen`); expense set-up (expense.policy.manage) changes them too. Gap: the drawn categories, mileage, per diem and travel desk rows are on the policy matrix, not this page |
| P4_8_ReadOnly · 4.8 Expenses & travel · read-only | live (gap) | View only for expense policy viewers and HR who read the company settings |
| P4_9 · 4.9 Contract labour | live (gap) | contract-labour map: /yx/settings/contract-labour renders this designed page (`SettingsPageScreen` pageId 4.9, `GET/PUT contract-labour/settings`); the per-site checklist stays design (question 751 there) |
| P4_9_ReadOnly · 4.9 Contract labour · read-only | live (gap) | contract-labour map: without the settings key, or while acting |
| P4_9_Registration · 4.9 Contract labour · registration (CL-5) | live | contract-labour map: `RegistrationSheet` on /yx/settings/contract-labour; `POST/PUT contract-labour/registrations` |
| P4_10 · 4.10 Earned wage access | live (gap) | /yx/payroll/ewa (`EwaAdminScreen`, `EwaPolicy`); partner and fees: unsure |
| P4_10_ReadOnly · 4.10 Earned wage access · read-only | live (gap) | read-only: the page passes `canManage` |
| P4_11 · 4.11 Benefits & FBP | design only, feature not built | searched `insurance|fbp|flexible benefit|employer nps` in apps/api/src: only accidents, letter fields and the country pack; no benefits tables |
| P4_11_ReadOnly · 4.11 Benefits & FBP · read-only | design only, feature not built | as the page |
| PayLive · Payroll page · live with the company settings (S-3) | live | the three S-3 pages with sample company values (`page` 0 to 2): Starter default chips, the legal limits naming the Act, Send for approval |
| PayLiveWaiting · Payroll policies · live, a change waiting for a second person (1325) | live | two changes waiting: one from someone else (Approve, Reject), one of the viewer's own (Withdraw only) |

#### Group 5 · Documents & Communication

File: `packages/yx-ui/src/screens/settings/settings-g5.stories.tsx`.

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Group 5 · Documents & Communication | live | S-1: /yx/settings/<group> renders `SettingsGroupScreen` with `live`: the group's pages the viewer may open, each linking to its live editor; a group with none says no access |
| OverviewLoading · Group 5 · loading | live | same, loading |
| P5_1 · 5.1 Document types | live (gap) | S-8 (answer 1331): /yx/settings/documents/document-types: the starter types (read-only) and the company's own, added, changed and retired in `DocumentTypeDrawer` (`POST/PUT documents/types`, `POST documents/types/:key/retire`). Gap: the drawn Verification, Expiry and Retention sections are not built |
| P5_1_ReadOnly · 5.1 Document types · read-only | live (gap) | without HR's settings key the list shows without Add or Edit |
| P5_2 · 5.2 Letters | live (gap) | /yx/settings/letters (`LetterTemplatesList`: Word templates, paragraphs, preview; `letters` API); letter types and reference numbers: unsure |
| P5_2_ReadOnly · 5.2 Letters · read-only | live (gap) | read-only: unsure |
| P5_3 · 5.3 Signatories & e-sign | live (gap) | signatories on the same page (`SignatoriesDrawer`, `letter.signatory.manage`); the company DSC is a flag on letters (`companyDsc`); Aadhaar eSign: none found |
| P5_3_ReadOnly · 5.3 Signatories & e-sign · read-only | live (gap) | read-only: unsure |
| P5_4 · 5.4 Notifications | live (gap) | S-8: /yx/settings/documents/notifications: notification emails on or off company-wide (`notify.email.enabled`) and the daily digest time (`notify.digest.time`), with the link to the wording editor (/yx/settings/emails). Gap: quiet hours, WhatsApp events, field staff and the email sender are not built (no push, WhatsApp or SMS for employees yet) |
| P5_4_ReadOnly · 5.4 Notifications · read-only | live (gap) | View only without HR's settings key |
| P5_5 · 5.5 WhatsApp & SMS | live (gap) | /yx/settings/sms (`SmsSettingsScreen`, `notifications/sms`: accounts, DLT, deliveries); WhatsApp only as the older candidate WhatsApp set-up (`organizations/whatsapp-config`, /v2) |
| P5_5_ReadOnly · 5.5 WhatsApp & SMS · read-only | live (gap) | read-only: unsure |
| P5_6 · 5.6 Announcements | design only, feature not built | searched `announcement` in apps/api/src: none |
| P5_6_ReadOnly · 5.6 Announcements · read-only | design only, feature not built | as the page |
| P5_7 · 5.7 Policies | live (gap) | S-7 (answer 1321): /yx/settings/documents/policies: acknowledgement days, reminders, re-acknowledgement, typed name, second person to publish, the AI writer and the industry; policies themselves on /yx/desk/policy-admin |
| P5_7_ReadOnly · 5.7 Policies · read-only | live (gap) | View only without HR's settings key |
| P5_8 · 5.8 Helpdesk | live (gap) | /yx/desk/setup (`DeskSetupScreen`: queues, catalogue, response times, rules, mail, knowledge-base review) |
| P5_8_ReadOnly · 5.8 Helpdesk · read-only | live (gap) | read-only: unsure |
| P5_9 · 5.9 Engage | design only, feature not built | searched `kudos|recognition` in apps/api/src: none; the growth screens (feed, rewards, recognition) are on the not-live list |
| P5_9_ReadOnly · 5.9 Engage · read-only | design only, feature not built | as the page |
| P5_1_Live · 5.1 Document types · live | live | the drawn 5.1 page with `documentTypesPage` (starter and company types) |
| DocumentTypeAdd · 5.1 · Add document type | live | `DocumentTypeDrawer`; a name is required (field error and focus) |
| DocumentTypeOwn · 5.1 · Change a company type | live | the same drawer with Retire (refused while a document uses the type) |
| DocumentTypeStarter · 5.1 · A starter type (read-only) | live | read-only, "A YukthiX starter type: it cannot be changed or removed." |

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
| P6_3 · 6.3 Performance | live (gap) | S-8 (answer 1323): /yx/settings/talent/performance: the 18 company performance choices (`perf.*`), links to review cycles, the comp review and competencies; performance set-up (perf.setup.manage) changes them too. Rating scales and templates stay on /yx/settings/performance (`PerformanceSetupScreen`). Gap: the drawn stages, 360° limits and calibration guide are not company settings yet |
| P6_3_ReadOnly · 6.3 Performance · read-only | live (gap) | View only for HR who read the company settings without a change key |
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
| P8_1 · 8.1 Plan & add-ons | live (gap) | S-9 (answer 1328): /yx/settings/account/plan-and-add-ons, read-only (`GET account/billing`, the billing key): the plan YukthiX set, the trial end, the products switched on. Gap: add-ons, switching a product on, billing period and bundle discount are not built (no payment here) |
| P8_1_ReadOnly · 8.1 Plan & add-ons · read-only | live (gap) | the page is read-only for everyone with the billing key |
| P8_2 · 8.2 Usage & caps | live (gap) | S-9 (answer 1328): /yx/settings/account/usage-and-caps, read-only: people who can sign in, candidates, AI credits and proctoring minutes against the plan this month. Gap: usage alerts, SMS billing and caps, top-ups and API limits are not built |
| P8_2_ReadOnly · 8.2 Usage & caps · read-only | live (gap) | as the page |
| P8_3 · 8.3 Invoices & payment | live (gap) | S-9 (answer 1328): /yx/settings/account/invoices-and-payment, read-only: the invoices from the payment provider (none, or "could not be read", is no error). Gap: billing contacts, GST details per entity, PO number and the group statement are not built |
| P8_3_ReadOnly · 8.3 Invoices & payment · read-only | live (gap) | as the page |
| P8_4 · 8.4 Sandbox | design only, feature not built | searched `sandbox` in apps/api/src: only Content-Security-Policy headers |
| P8_4_ReadOnly · 8.4 Sandbox · read-only | design only, feature not built | as the page |
| P8_5 · 8.5 Data export & closure | live (gap) | S-9 (answer 1332): /yx/settings/account/data-export-and-closure, System Admins: the whole-company export (security key; link works `account.export.link_hours`, 24) and asking YukthiX to close the account (staff close it; data kept `account.closure.keep_days`, 30). Gap: export formats, the per-employee document pack and legal holds are not built; deletion after the kept days is not automatic (questions 1881 to 1883) |
| P8_5_ReadOnly · 8.5 Data export & closure · read-only | live (gap) | someone with the billing key who is not a System Admin sees the page; starting an export or asking to close says only a System Admin can |
| P8_6 · 8.6 Analytics, status & tips | live (gap) | the maintenance banner is live (`GET /availability`); S-7 (answer 1321): What's new and tours switches on /yx/settings/account/analytics-status-and-tips. Gap: product analytics and status settings are not on the page |
| P8_6_ReadOnly · 8.6 Analytics, status & tips · read-only | live (gap) | View only without HR's settings key |
| P8_1_Live · 8.1 Plan & add-ons · live, read-only | live | `planPage` with GET account/billing |
| P8_2_Live · 8.2 Usage & caps · live, read-only | live | `usagePage` |
| P8_3_Live · 8.3 Invoices & payment · live, read-only | live | `invoicesPage` |
| P8_5_Live · 8.5 Data export & closure · live | live | `dataPage` with GET account/data: start an export, download while the link works |
| P8_5_Asked · 8.5 · closing asked for | live | the request with who asked, and Withdraw |
| ClosureRequest · 8.5 · Ask YukthiX to close the account | live | `ClosureRequestDrawer`: the company name typed and why (field errors, focus) |

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
  3.9 Leave year (`timeSettingsPage`, `TIME_SETTINGS`; 3.11 is the Projects settings page, see the follow-up below). Each is the front door of its page
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

## S-2 follow-ups (answers 1409, 1485; branch `feat/yukthix-settings-s3`, first commit)

- **One 3.11:** /yx/settings/time/projects-and-timesheets is gone (3.11 left `TIME_SETTINGS` and `TIME_SETTINGS_PAGES`).
  Its one setting, "Timesheet pre-fill" (`timesheet.tool_suggestions`, off by default, answer 1409), is now in the drawn
  "Pre-fill from work tools" section of /yx/settings/projects, the Projects P-1 page. Only the settings page files
  changed (`projects-live.ts` and the page): the switch is read and saved through /org/settings with HR's settings key,
  locked without it, and left out for someone who cannot read the company settings. The projects API is untouched.
  Since the S-3 merge, Projects P-3 owns this switch in the projects settings API, so the page's separate /org/settings
  path was taken out again (both had been merged; the page now has one way to read and save it, the P-3 one).
  Every hidden Time & Leave setting still has a field (39 on the Time & Leave pages, 1 on Projects; kit test).
- **1485, leave admins:** HR's leave admins (`leave.settings.manage`, the key that opens Time › Leave types & policies)
  open and change the leave pages (3.6 Leave types, 3.8 Holiday calendars, 3.9 Leave year): `PUT/DELETE org/settings`
  accept it for those 13 settings (`LEAVE_PAGE_KEYS`, same legal-entity reach), `GET org/settings` lets them read.
  Attendance and roster limits (3.2 to 3.5) stay with HR's company settings key. Tested both ways: a leave admin saves
  Leave year (audited as them) and is refused Weekly offs (403); the menu offers them only the three leave pages.

## S-3 as built (answers 1323 to 1325; branch `feat/yukthix-settings-s3`)

- **The Payroll & Statutory pages, live:** /yx/settings/payroll/<page> renders the drawn `SettingsPageScreen` for 4.3
  Payroll policies, 4.4 Payslip layout (menu: Payslip settings, beside the layout editor) and 4.5 Tax (`PAY_SETTINGS`,
  the same builder as S-2; the route and the Time & Leave one share `RegistrySettingsPage`). Each is the front door of
  its page. HR's settings key changes them; payroll set-up reads them (View only).
- **1323:** the 16 payroll and tax settings that had no screen each sit on one drawn page, marked Starter default (a
  Mid-month changes section on 4.3 and a Keeping pay documents section on 4.4 are added; dates read "31 May", amounts
  "₹50,000").
- **1324:** the rule set `IN.SETTINGS.LIMITS` gains version 2026-v2 (migration `202617z0000131`; the published v1 never
  changes): standard hours a day at most 9 (Factories Act, 1948 s.54) and pay documents kept at least 8 years
  (Companies Act, 2013 s.128(5)), with the S-2 limits carried over. Both are also the edges of their choice lists, so
  today they show as the legal hint and are checked again when a change is approved.
- **1325, a second person:** a new company setting "Payroll setting changes need a second person" (on by default;
  turning it off needs the access key too and itself waits for a second person). While on, a change to a setting on
  these pages is saved as a request (`setting_change_requests`, forced RLS, one waiting per setting and scope) and
  nothing changes. The page says "Send for approval" and lists "Waiting for a second person": another person with HR's
  settings key approves (the value applies, checked against the law again) or rejects; the person who asked may only
  withdraw. Never the person who asked: the API refuses (403) and a database check (`setting_change_requests_four_eyes`)
  refuses it too. Audited: `org.setting.change_requested`, `org.setting.change_approved` and `org.setting.changed` (with
  who asked and who approved), `org.setting.change_rejected` (withdrawn or not, with the note). Other pages save at once;
  the drawn "affects 248 employees" is no longer shown on live pages (it was sample data).
- **S-2 follow-ups in this branch:** see "S-2 follow-ups" above (one 3.11, answer 1485). The S-2 e2e no longer depends on
  the order of two audit rows written in the same millisecond (the one-off failure on test main).
- **Page scroll at 1278 x 635** (Storybook `PayLive`, `PayLiveWaiting`): Tax fits; Payslip layout needs 669 px and
  Payroll policies 1545 (12 settings), as in S-2 (question 1481, approved: keep one column).
- **Tests:** API e2e `settings-s3-payroll` (listed with starter values and limits; payroll set-up and others refused; a
  change waits, nothing applies, one at a time, audited; the asker and someone without the key cannot approve, another
  HR person does, audited with both; rejected and withdrawn change nothing, audited; the database refuses a self
  approval; other settings save at once; the switch needs the access key and a second person, then payroll changes save
  at once; another company sees none). Kit `pay-settings-live.test` and web `yx-settings-payroll.test` (fields,
  words, legal hint, Send for approval, Approve and Reject, Withdraw only for the asker, a refused approval stays on the
  page, view only for payroll set-up, the layout editor link).

### Questions (from 1521)

1521. **Payroll rules saves at once.** The Payroll rules page (bonus, loans; the Company rules format) is not covered by
      the second person yet. *Suggested: it is covered when its settings move to 4.6 in S-7 (answer 1321).*
1522. **Telling the other person.** A waiting change shows only on the page. *Suggested: a bell notification and email
      to the others with HR's settings key when a payroll change waits, and to the person who asked when it is decided.*
1523. **Changes nobody decides.** *Suggested: a waiting change lapses after 14 days (a company setting, default 14),
      audited, and the person who asked is told.*
1524. **Several changes in one save.** Each setting waits and is decided on its own. *Suggested: keep (an approver may
      approve some and reject others); add "Approve all" if HR asks.*
1525. **Who approves.** Today only HR's settings key. *Suggested: keep; payroll set-up reads but never approves policy
      (MT-PAY-B-07).*

## S-4 as built (answers 1323, 1324; branch `feat/yukthix-settings-s4`)

- **Your own database first:** examapp_pay had been rebuilt from the migrations without the seed, so the demo company,
  its admins and the permission templates were missing (the 403s in time-open-standby and access-privacy). The seed
  now runs there (`prisma db seed`, own database only); both suites pass (12/12, 42/42).
- **The People pages with settings that had no screen, live:** /yx/settings/people/<page> renders the drawn
  `SettingsPageScreen` for 2.7 Exit & lifecycle policies and 2.10 Audit & data retention (`PEOPLE_SETTINGS`, the same
  builder and `RegistrySettingsPage` as S-2 and S-3). The 15 settings (notice periods, rehire, absconding, retirement,
  VRS, alumni, audit log) each have a field marked Starter default. The notice periods are dated: a change applies
  from today (`validFrom` today), earlier days keep their value, and the page shows the value in force today.
- **2.5, 2.6 and 2.9 are not built here:** they hold no hidden setting; all their settings are on Company rules with
  values per entity, employment type or grade (probation, job changes, transfers, speak-up). Moving them now would lose
  "Different for" until S-7 (answer 1484), so their front doors stay Company rules, checklists and Speak-up set-up
  (question 1561). 2.7 and 2.10 link to Company rules and Access and privacy (Related) for their other settings.
- **1324:** `IN.SETTINGS.LIMITS` version 2026-v3 (migration `202617z0000141`) adds the audit log kept at least 8 years
  (Companies (Accounts) Rules, 2014 r.3(1) with the Companies Act, 2013 s.128(5)); the limits read the latest version
  published for the day. Retirement age, notice and VRS have no national floor or ceiling for private employers.
- **Page scroll at 1278 x 635** (Storybook `PeopleLive`): 2.10 fits; 2.7 needs 1595 px (14 settings), one column as
  approved (1481).
- **Tests:** API e2e `settings-s4-people` (listed with starter values and the audit minimum; saves audited with before
  and after; a dated notice period needs its start day; the audit log length needs the access key and never goes
  under 8 years; someone without HR's settings key reads and changes nothing). Kit `people-settings-live.test`, web
  `yx-settings-people.test` (the value in force today, today's start day sent, Related opens Company rules, view only).

### Questions (from 1561)

1561. **2.5, 2.6 and 2.9.** Their settings are all on Company rules, many per entity or grade. *Suggested: they move,
      with "Different for", in S-7 when Company rules retires; until then their front doors stay where they are.*
1562. **Notice period from a later day.** A change applies from today; Company rules can still set a later start day.
      *Suggested: add "Applies from" on dated settings in S-7 with "Different for".*
1563. **A company audit log page.** The drawn "Open audit log" has no company-wide page in /yx (only Payroll's).
      *Suggested: build the company audit log with 1326 (change history), readable with audit.view.*
1564. **Retirement age per grade.** Retirement age can differ per employment type and grade (set on Company rules
      today). *Suggested: keep it there until S-7, as 1561.*

## 1522, 1523 and the second-factor state as built (branch `feat/yukthix-settings-s4`, own commits)

- **1522, who is told:** when a payroll setting change waits for a second person, each other active holder of HR's
  settings key (System Admins, profiles with `org.settings.manage`, role grants in force) gets a bell notice and an
  email (`settings.change.waiting`, linking to the page); the person who asked never does. When it is approved or
  rejected, the person who asked is told (`settings.change.decided`); a withdrawal is their own act, so no notice. Both
  types are in the notification catalogue, so each person's email choices apply (`SettingChangeNoticesService`).
- **1523, lapsing:** a new company setting "A payroll setting change nobody decides lapses after (days)"
  (`payroll.settings.lapse_days`: 7, 14, 21, 30; default 14) on 4.3 Payroll policies, itself a payroll setting (a second
  person approves its change). The nightly sweep `settings-change-lapse` (02:00 IST) lapses a change still waiting more
  than N IST days after it was asked: status `lapsed` (migration `202617z0000142`; the database checks that a lapsed
  change has no person deciding it), nothing changes, audited as the system (`org.setting.change_lapsed`, with the
  setting value) and the person who asked is told. A rerun finds nothing new.
- **The second-factor state (walk of S-3):** on the Time & Leave, Payroll and People settings pages, the API's
  MFA-required 403 now shows "Add a passkey or an authenticator app to open this page" with Set it up (My security),
  as the top banner says; a real failure still says "We couldn't load ..." with Retry.
- **Tests:** API e2e `settings-notices` (each other holder gets one notice and one email, the asker and payroll set-up
  none; the asker is told approved and rejected; a change lapses at 15 days but not at 14, audited as the system, the
  asker told, a rerun lapses nothing more and the lapsed change cannot be approved; at 7 days a change of 8 days
  lapses). Kit `settings-mfa-state` and web `yx-settings-payroll` (the MFA state and a real failure).

## S-5 as built (answers 1326, 1333, 1461, 1563; branch `feat/yukthix-settings-s5`)

- **1326, change history on each page:** the Time & Leave (S-2), Payroll (S-3) and People (S-4) settings pages and 3.11
  Projects show "Last changed by … on …" under the title and View history with the last 20 changes: who (with "System
  Admin" when known), when, where it applies (Company or the entity or location) and before and after in the page's
  words ("from Starter default to 48"). Source: the audit log's `org.setting.changed` rows, through one endpoint,
  `GET org/settings/history?keys=…&limit=` (at most 20). It answers only for settings the person may read: the
  Projects settings for the company settings key or Projects manage; every other setting for the keys that read the
  company settings (as `GET org/settings`); anything else is refused (403). Each page asks only for its own settings.
- **1461, Recently changed on the home:** the last three changes on pages the person may open (the same endpoint, only
  those pages' settings), each linking to its page; "Audit log" beside it for audit.view.
- **1333, view-only pages:** Time admins (`leave.settings.manage`, who set up shifts, devices and leave) now open every
  Time & Leave settings page: the leave pages (3.6, 3.8, 3.9) they change (answer 1485), the attendance ones (3.2 to
  3.5) read-only. HR who read the structure (`org.structure.view` with an HR key) open 2.7 and 2.10 read-only. The
  structure key alone still opens no settings page (managers use it for pickers; founder review 8 Oct 2026). Read-only
  pages show View only, no save bar, and their history; the API refuses a save (`PUT org/settings`, 403).
- **1563, the company audit log:** Settings › People & Access › Audit log (`/yx/settings/audit-log`, also 2.10's front
  door for audit.view), the drawn PLT-16 `AuditLogScreen` with `live`. It reuses the existing audit query (the one behind
  Payroll's audit page, `GET payroll/audit`), so the same rules apply: audit.view, company-wide or per legal entity,
  restricted areas (POSH, disciplinary, grievance, whistleblower, medical leave) only for their members, pay and
  identity values masked without their keys. New filters on that query: area (Settings, Access & security, People,
  Time and leave, Payroll, Hiring, Performance, Expenses, Helpdesk, Approvals, Projects, by action family) and person
  (any part of a name or email), with the date range it already had. Payroll's own page stays (chain check, holds,
  export) and is linked.
- **Not built:** the drawn chain badge and Export on the company page (Payroll's page has both; question 1722); the
  drawn "From" channel column (not recorded; question 1723).
- **Tests:** API e2e `settings-s5-history` (8: history newest first with who, where, before and after, only the asked
  settings; the limit and unknown settings refused; the view key reads it, Projects manage reads 3.11 only, the view key
  is refused 3.11, no key and audit.view alone refused; another company's change never shows; the view key cannot save;
  the audit log refused without audit.view; filtered by area, person and date; a bad area refused; one company never
  sees another's entries). Kit `settings-history-live.test` (10). Web `yx-settings-time` (history asked for the page's
  own settings only; none when nothing changed), `yx-settings-home` (Recently changed links to its page; a payroll-only
  admin never asks for the Time & Leave history; no audit link without the key), `yx-settings-audit` (reads, filters by
  area; no access without the key), `yx-nav` (a Time admin opens the Time & Leave pages; the structure key alone opens
  none; HR with the structure key open 2.7 and 2.10; the audit log needs audit.view).

### Questions (from 1721)

1721. **Who else may read a page.** The drawing names only the key that edits each page. Built: Time admins read the
      attendance pages, HR with the structure key read 2.7 and 2.10, payroll set-up reads the payroll pages, Projects
      managers read 3.11. *Suggested: keep; add a reader per page when a role asks for one.*
1722. **Chain badge and Export on the company audit log.** Both live on Payroll's audit page today. *Suggested: show the
      chain result and Export (audit.export) here too, and keep Payroll's page for holds.*
1723. **"From" (web, phone, API).** The drawn column needs the channel recorded with each audit row; it is not.
      *Suggested: record it from now on (no back-fill) and show it when present.*
1724. **History older than the last 20.** Each page shows the last 20 changes; older ones are on the audit log page.
      *Suggested: keep, with a "See all in the audit log" link from the history drawer.*

## S-6 as built (answer 1330; branch `feat/yukthix-settings-s6`)

- **2.4 Approvals, live:** /yx/settings/people/approvals renders the drawn `SettingsPageScreen` (front door of 2.4):
  "Policies per request type" lists each request type with its approvers, who must decide, the time to decide and what
  happens if no one does (read-only, from `GET workflow/policies`), with the drawn link to the policy editor; "Reminders
  and escalation" holds the two company settings `approval.remind_hours` (default 24) and `approval.escalate_hours`
  (default 48), saved through `PUT org/settings` and shown in the page's history.
- **The policy editor, live:** /yx/settings/approval-policies renders the drawn PLT-12 `PolicyEditorScreen` with `live`:
  pick a request type; give it 1 to 5 steps, each with a name, who approves (the person's manager, their manager's
  manager, or the HR Admins) and whether any one or all decide; save as a new version, or go back to the built-in steps.
- **On the existing engine:** a company policy is stored per request type (`approval_policies`, tenant RLS, migration
  `202617z0000172_approval_policies`) and the shared engine uses it when the request is sent
  (`ApprovalsEngine.submit`), in place of the module's steps; each company step reminds after the company's hours and
  escalates to the approver's manager after the escalation hours (the engine's existing reminder and escalation). The
  route is copied into the request, so a change applies to new requests only. A request the module approves at once
  (no steps) stays that way. The HR Admins are a new approver kind (`hr`, the people holding HR's settings key).
- **Which request types:** the 13 people requests (leave, leave cancellation, comp-off, attendance fix, work from home,
  on duty, overtime, overtime pre-approval, shift swap, timesheet, expense claim, trip, expense advance). Payroll, pay,
  equity, offers and hiring routes keep their module approvers (hiring moves here later, as answered).
- **Nobody approves their own request:** the engine already takes the requester and whoever raised it out of every
  step; a company step with only them falls back as before.
- **Who:** HR's settings key changes policies and hours; people who read the company settings see both read-only
  (Approvals and Approval policies in the menu). Every change is audited: `workflow.policy.changed` (before and after,
  version) and `workflow.policy.reset`; the hours as `org.setting.changed`.
- **Tests:** API e2e `settings-s6-approvals` (7: the view key reads and cannot change, no key refused; empty steps, a
  one-letter name, an unknown approver, a guarded type (payroll run) and a stale version refused; saved as version 1 and
  audited with before and after; another company sees only built-in; a request follows the company steps, the requester
  is in no step and cannot decide, step 1 any one, step 2 needs all, then approved; back to the built-in steps, audited;
  the hours set to 4 and 24: no reminder at 3.5 hours, a reminder at 4, escalation at 24). Kit `policy-editor-live.test`
  (6), web `yx-settings-approvals.test`, `yx-nav` (Approvals in the menu).

### Questions (from 1761)

1761. **The drawn page's other fields.** Default mode, escalate-to, automatic decisions after a timeout, approve from
      email or WhatsApp, risk levels, approve-with-changes, duplicate approver and delegation on leave. Some exist in
      the engine already (risk, automatic decisions only for low risk, delegation). *Suggested: add them one by one as
      company settings when a customer asks; delegation on leave is already live on Delegation.*
1762. **Conditions and Simulate.** The drawn editor has several policies per type with conditions (amount, category,
      grade) and a Simulate run before saving. Built: one policy per type, no conditions. *Suggested: conditions with
      expense claims first (amount and category), with Simulate, in a later slice.*
1763. **Named people and groups as approvers.** The engine can route to named people and user groups. *Suggested: add
      "Named people" with a people picker when a customer asks for a fixed approver (for example a plant head).*
1764. **The built-in steps on the page.** A type without company steps shows "Built in", since each module builds its
      steps when a request is sent. *Suggested: describe each module's built-in steps in words on the page.*
1765. **Escalation for built-in steps.** The company's reminder and escalation hours apply to the company's own steps;
      built-in steps keep their module's timing (leave: reminder 24, escalation 72). *Suggested: apply the company hours
      to every people request type's built-in steps too.*

## S-7 as built (answers 1321, 1484, 1521, 1561, 1562, 1564, 1764, 1765; branch `feat/yukthix-settings-s7`)

- **The three old pages retired (1321):** Company rules, Access and privacy and Payroll rules are gone from the menu;
  their addresses redirect (company-rules to Settings, access-settings to 2.2, payroll-rules to 4.6), so bookmarks
  still work. Every one of their settings has exactly one home on a drawn page: 1.1 Company & branding, 1.5 Employee
  records, 1.6 Set-up hub, 2.1, 2.2, 2.3, 2.5, 2.6, 2.7 (fixed-term contracts), 2.9, 2.10 (Not found references), 3.1
  Attendance modes, 3.3 (flexi and split shifts), 4.6, 5.7 Policies and 8.6 Help and tips. New front doors:
  /yx/settings/org/*, /yx/settings/documents/policies, /yx/settings/account/analytics-status-and-tips.
- **Different for (1484):** on every registry page, "Apply changes to" lists the company and each entity, location,
  department, employment type and grade the setting may differ by (from the registry's scopes); a value of its own can
  be set for one place, saved as `PUT org/settings` with that scope. Storage is unchanged, so values set before the move
  read the same after.
- **Applies from (1562):** a changed dated setting shows an "Applies from" date (today by default, never earlier).
- **People pages (1561, 1564):** 2.5 Onboarding & probation, 2.6 Job changes & transfers and 2.9 Employee relations &
  cases are live; the retirement age may differ by grade or employment type (2.7), and the VRS estimate now reads it by
  grade too, as the retirement sweep already did.
- **Payroll rules on 4.6 (1521):** the 11 statutory bonus settings, the 4 loan settings and payroll reports access are
  on 4.6 and wait for a second person while "Payroll setting changes need a second person" is on.
- **Built-in steps in words (1764):** 2.4 and the policy editor describe each module's built-in steps (for example
  "Manager; HR too when the leave is longer than its leave type allows without HR").
- **Company hours on built-in steps (1765):** the 13 people requests on built-in steps are reminded at
  `approval.remind_hours`; a manager's step (or one the module already times out) escalates at
  `approval.escalate_hours`. A step for named people only (a colleague agreeing to a swap) is reminded, not escalated.
  Payroll, pay, equity and hiring routes keep their module hours.
- **Tests:** API e2e `settings-s7-moves` (6: a per-entity value reads the same before and after a company change; a
  setting that may not differ by entity refused; retirement age per grade, the exit notice months refused per grade;
  a loan limit waits, the requester cannot approve, another HR person does; a bonus setting waits, with the switch off
  reports access saves at once) and `settings-s6-approvals` (+2: a leave request on built-in steps reminds at 4 hours
  and escalates at 24, the company hours; a named-people step is not escalated; a type outside the 13 keeps 24 hours).
  Kit: `settings-different-for.test` (one home per old setting, payroll keys only on 4.6, Different for, Applies from),
  `policy-editor-live.test`. Web: `yx-settings-s7.test` (the new pages, View only, 4.6 Send for approval),
  `yx-org-pages.test` (the three redirects), `yx-nav.test`, `yx-settings-home.test`, `yx-settings-people.test`.

### Questions (from 1781)

1781. **The three retired stories.** The CompanyRules, AccessAndPrivacy and PayrollRules stories and
      `CompanySettingsScreen` are no longer used by any page. *Suggested: delete them in the next kit clean-up.*
1782. **Escalating a step for named people.** A built-in step that names people (a colleague's consent, the travel
      desk, finance) is reminded at the company hours but not escalated, since escalation would let someone else decide
      for them. *Suggested: keep.*
1783. **Applies from in the past.** Applies from cannot be earlier than today (a back-dated rule would change past
      pay or leave). *Suggested: keep; a back-dated change stays a System Admin correction.*
1784. **Different for by department.** Departments are offered only where the registry allows them (none of the moved
      settings do). *Suggested: add department where a customer asks.*

## S-8 as built (answers 1323, 1331, 1781; branch `feat/yukthix-settings-s8`)

- **1781, the retired screen deleted:** `CompanySettingsScreen` (`screens/org/settings.tsx`), its 16 stories, its tests
  and the sample data only they used are gone; nothing live imported them. `ErasureCard`, live on 2.2, moved to
  `screens/org/erasure-card.tsx` with two stories and its own tests. The S-7 move tests read the frozen list of the old
  pages' 79 keys (`screens/settings/retired-page-keys.ts`).
- **4.8 Expenses & travel (1323):** /yx/settings/finance/expenses-and-travel shows the 14 company expense choices that had
  no screen, with Starter default, and links to the policy matrix. Besides HR's settings key, expense set-up
  (expense.policy.manage) changes them (as leave set-up does for leave); expense policy viewers read them.
- **6.3 Performance (1323):** /yx/settings/talent/performance shows the 18 company performance choices, with links to
  review cycles, the comp review and competencies; performance set-up (perf.setup.manage) changes them too. Each set-up
  key changes only its own settings.
- **5.4 Notifications:** /yx/settings/documents/notifications. Employees get notices in the app and by email only (no
  push, WhatsApp or SMS yet), so the page has the two choices that work: notification emails on or off company-wide
  (`notify.email.enabled`; the in-app bell always keeps every notice) and the daily digest time (`notify.digest.time`,
  07:00 India time by default; the digest sweep now runs hourly and sends each person once per India day at the first
  run at or after that time). The wording editor (Emails) is linked.
- **5.1 Document types (1331):** /yx/settings/documents/document-types lists YukthiX's starter types (read-only) and the
  company's own. HR's settings key adds a type and chooses its sensitivity (internal, personal or confidential), whether
  HR verifies it, whether it expires and when to remind (60, 30 and 7 days and other offered sets), and who uploads it
  (HR always can); changes it; or retires it while no document uses it (rows are never deleted). The types live in the
  existing `document_types` table under tenant RLS (no migration), so the verification queue, the payroll pre-flight
  check and the expiry reminders treat a company type like a starter one. Audited: `document.type.created`, `.changed`
  (before and after) and `.retired`.
- **Tests:** API e2e `settings-s8-modules` (7: each set-up key changes its own settings and not the other's, nor payroll
  or leave; viewers read only; HR changes both; 14 and 18 keys listed; with emails off the bell gets the notice and no
  email goes, back on it does; set-up keys cannot change the notification settings, a time not offered is refused) and
  `settings-s8-doctypes` (6). Unit: notifications (company switch) and the digest (the company time, once per India
  day, switch off). Kit: `settings-s8.test`, `org.test` (ErasureCard), the S-7 move tests on the frozen list; design,
  design-live, kit and UI-rule guards green. Web: `yx-settings-s8.test` (4.8, 6.3, 5.4 and 5.1, positive and negative),
  `yx-nav.test`, the settings home.

### Questions (from 1821)

1821. **The Factories Act "no longer needed" hint.** The retired Company rules page marked a location's own Factories
      Act value as "No longer needed: the location is a registered factory". 3.1 Attendance modes lists location values
      under "Different for" but does not show that hint yet. *Suggested: show it beside that location's value on 3.1.*
1822. **Starter document types per company.** A company cannot change a starter type (for example, remind about
      passports at 90 days instead of 60, 30 and 7). *Suggested: let HR set verification and reminders on a starter type
      for their company, kept as the company's own copy of those two choices; the type itself stays.*
1823. **Special sensitivity for company types.** A company type can be Internal, Personal or Confidential, not Special
      (Special is for Aadhaar, health and similar data, seen only by named HR people). *Suggested: keep; ask when a
      customer needs a Special type of their own.*
1824. **Quiet hours, WhatsApp and SMS.** The drawn 5.4 also has quiet hours, WhatsApp events and field staff. They apply
      to push, WhatsApp and SMS, which employees do not get yet. *Suggested: build each with its channel (answer 1329).*
1825. **Who reads the company settings.** Expense policy viewers and performance set-up can now read every company
      setting (`GET org/settings` returns them all), as leave and payroll set-up already can. *Suggested: keep (none
      is confidential); filter by page later if a customer asks.*
1826. **A company default for the digest.** Each person still chooses an email per notice or the daily digest; new
      people start with an email per notice. *Suggested: a company default for new people (per notice or daily
      digest), changeable by each person.*

## S-9 as built (answers 1328, 1332, 1821, 1822, 1826; branch `feat/yukthix-settings-s9`)

- **8.1 to 8.3, read-only (1328):** Plan & add-ons, Usage & caps and Invoices & payment show what the company has from
  `GET account/billing` (the billing key, `org:manage_billing`, which System Admins hold): the plan and products YukthiX
  set, this month's use against the allowance, and the invoices. There is no payment and nothing to change here.
- **Whole-company export (1332):** a System Admin with the security key starts it on 8.5. Every table with the company's
  rows is read in one pass under the company's RLS and filtered by its id too; sign-in material, secrets, encrypted
  fields and file references are left out (`apps/api/src/account/export-rules.ts`). The file (gzip JSON) is kept in the
  file store; its link works `account.export.link_hours` (24) and is 410 after. Starting and every download are audited.
- **Closing (1332):** a System Admin asks (types the company name, says why; audited; can withdraw). Nothing closes until
  YukthiX staff use Close in the console; that answers the request and keeps the data `account.closure.keep_days` (30).
  The database refuses a company marking its own request closed. Both periods are platform settings.
- **1821:** 3.1 shows "No longer needed: the location is a registered factory" beside that location's own value.
- **1822:** HR sets verification and expiry reminders on starter document types for their own company; the type stays
  YukthiX's; PAN, Aadhaar, bank proof, education and experience proofs stay always verified; "Back to YukthiX's choices".
- **1826:** 5.4 has the company default for new people (an email per notice, or one daily digest), applied when the
  account is made; each person changes their own.
- **Timesheet:** the weekly grid fits 1278 x 635 with Total in view (measured; see the commit).
- **Tests:** API e2e `settings-s9-account` (7), `settings-s8-doctypes` (+2), `settings-s8-modules` (+2); unit
  `export-rules.spec`. Kit `account-live.test`, `settings-s9-items.test`, timesheet grid tests. Web
  `yx-settings-s9.test` (group 8 positive and negative, 1821).

### Questions (from 1881)

1881. **The closure request in the console.** The console's company API now returns the company's request, but the
      console screen does not show it yet. *Suggested: show it on the company page beside Close.*
1882. **Deleting after the kept days.** The kept-until day is recorded; nothing deletes a closed company's data yet.
      *Suggested: a staff-confirmed deletion that issues a deletion certificate, once the founder approves it.*
1883. **What the export leaves out.** Encrypted fields, file contents and sign-in material are left out, and a table
      stops at 50,000 rows (the manifest says when). *Suggested: a document archive and the personal fields in readable
      form in a later version, behind an extra confirmation.*
1884. **The billing key.** The pages use the older `org:manage_billing`, which only System Admins hold. *Suggested: a
      YukthiX key "billing.view" so finance people can read the plan and invoices.*
1885. **The old /v2 billing pages.** They still offer online checkout through the payment provider. *Suggested: retire
      them now that 8.1 to 8.3 are live and payment is by bank transfer.*
1886. **Timesheet with several rows and an error box.** One row with the error box fits 1278 x 635; three rows with it
      need 76 px more, partly because "Submit opens Thu 1 Oct ..." shows both in the box and under the grid.
      *Suggested: show it once.*

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

- 1481 to 1485 approved as suggested (12 Nov 2026, "ok for all"). To build: the leave settings key may change the leave pages (Leave types, Holiday calendars, Leave year); attendance and roster limits stay with HR (1485). Later: state working-hour rule sets per location (1482, then 1483); "Different for" on these pages with S-7 (1484); tabs only if HR finds long pages hard (1481).

- 1521 to 1525 approved as suggested (12 Nov 2026, "ok for all"). To build: bell and email to the other HR settings holders when a payroll setting change waits, and to the asker when decided (1522); waiting changes lapse after 14 days, a company setting, audited, asker told (1523). With S-7: Payroll rules bonus and loan settings move to 4.6 under the second person (1521).

- 1561 to 1564 approved as suggested (12 Nov 2026, "ok for all"). With S-7: Onboarding & probation, Job changes and Employee relations move with "Different for" (1561); "Applies from" on dated settings (1562); retirement age per grade (1564). With 1326: a company-wide audit log page readable with audit.view (1563).

- 1721 to 1724 approved as suggested (12 Nov 2026, "ok for all"). To build: chain badge and Export (audit.export) on the company audit log (1722); record the channel (web, phone, API) with audit entries from now on and show it when present (1723); "See all in the audit log" from each history drawer (1724). 1721: readers per page as built; add one when a role asks.

## 1722 to 1724 as built (branch `feat/yukthix-settings-s6`, first commit)

- **1722:** the company audit log shows the latest daily integrity check ("Chain verified …", or "Chain check failed" with
  what it found) and Export CSV for people with audit.export, both from the existing payroll audit endpoints
  (`GET payroll/audit/chain`, `GET payroll/audit/export`, with the page's area, person and date filters).
- **1723:** every audit row written for a request now records where it came from: `web`, `phone` (a phone browser or app,
  by its user agent) or `api` (the public API). The app keeps the request's channel for the whole request
  (`recordRequestChannel`, `@exam-platform/shared`) and sets `app.channel` with each tenant transaction; the new column
  `audit_logs.channel` takes it by default (migration `202617z0000171_audit_channel`), so every writer records it
  unchanged. Earlier rows and jobs have none. The column is outside the hash chain; the append-only trigger still refuses
  any change. The audit log shows a "From" column once an entry has it, and the entry drawer says it.
- **1724:** each page's history drawer ends with "See all in the audit log" (the company audit log with the Settings
  area chosen), for people with audit.view.
- **Tests:** API e2e `settings-s5-history` (11: plus a phone change records Phone and a desktop one Web, shown in the log;
  the channel can never be changed; the check for audit.view; Export needs audit.export and holds only the company's
  rows); kit `settings-history-live.test` (13: plus the badge and Export, a failed check, From only when present, See all
  only for audit.view).

- 1761 to 1765 approved as suggested (12 Nov 2026, "Ok for all"). To build: describe each module's built-in steps in words on 2.4 (1764); apply the company reminder and escalation hours to built-in steps of people requests too (1765). Later slice: conditions plus Simulate, starting with expense claims (1762). When a customer asks: the other 2.4 fields (1761), named people and groups (1763).

- 1781 to 1784 approved as suggested (13 Nov 2026, "Ok for all"). To do: delete the unused CompanyRules, AccessAndPrivacy and PayrollRules stories and screen in the next kit clean-up (1781).
