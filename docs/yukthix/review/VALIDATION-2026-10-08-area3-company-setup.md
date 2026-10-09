# Validation · Area 3 · Company setup (Legal entities, Locations, Structure, Company rules)

**Date:** 8–9 Oct 2026 · **Validator:** independent, read-only (no code changed, nothing committed) · **Build:** `C:/D-drive/exam-app-org` (API `org-structure/**`, `yx-ui/screens/org/**`, migration `20261007000000_org_structure`) · **Live:** admin2@ (System Admin), plant-hr@ (HR, plant), consultant@sharma-advisory.test · **Screenshots:** `scratchpad/area3/*.png` (47 files; names quoted below).

## Summary (plain English)

1. What was planned for company setup in P01 §4.1–4.6 and the YX-ORG rules is built and matches the plan closely: one default entity, fixed India data region, confidential entity identifiers with audited reveal, locations with mandatory state and time zone, a loop-free department tree, shared / entity-only masters with unique scoped codes, cost centres tied to one entity, dated grade pay ranges that close the previous one, and scoped settings resolved most-specific-first with the source shown.
2. Every rule is enforced in the API and, where it can be, in the database too (unique indexes, GiST no-overlap, composite entity keys, fixed-region trigger). Audit entries are written in the same transaction.
3. The four screens work live for admin2 at desktop and 390 px, light and dark, with no horizontal scroll, correct breadcrumbs ("Organisation › …" matches the menu) and no console errors from these pages.
4. One serious UI bug found: the first keystroke typed into any empty form field is dropped and Playwright `fill` is ignored. It reproduces on the sign-in page and every org drawer. It appeared with today's commit `c95e2bf1` (FormField `onInputCapture` → `setTyping`). Must be fixed before any manual testing round.
5. Pay-range and identifier screens could not be exercised live (admin2 holds neither `pay.range.view` nor `org.entity.statutory.manage`; the API returns 403 as designed). They are validated by code, the e2e spec and the yx-ui tests: pass.
6. Two design-system misses: the Company rules "Change" drawer uses a dropdown for a 2–3 option single choice (Attendance mode, retro limit, missing punches) instead of the Segment control; the Time zone field is free text, not a picker.
7. Story acceptance vs build: US-A-076 says step-up is asked when identifiers are **opened**; the build asks step-up only on **save** (open is audited). Either the story or the code needs to change.
8. YX-ORG-16 clash listing is built in the API (409 with `clashes`) but the Legal entities screen shows only the message, not the list of people/codes.
9. Seven of the 19 manual tests are stale against the built behaviour (3-02, 3-04/05 wording, 3-09, 3-10, 3-15, 3-16, 3-01) — details below; none of them indicates a product defect.
10. Deferred and planned-later items are honest and tracked (D-021…D-031): statutory default matrix, tree parent picker, entity-specific settings UI, entity merge/close wizard, holiday calendar links. No "Done" story claims something that isn't there, except the step-up-on-open point in US-A-076.

**Counts:** checklist 38 items — ✅ 29 · ⚠️ 5 · ❌ 1 · 🔄 3. UI findings 12 — High 1 · Med 6 · Low 5. Stale manual tests 7 of 19. Story gaps 4.

---

## 1. Checklist — PLANNED → BUILT → VERIFIED

| # | Planned (doc / rule) | Built (file:line · route · migration) | Verified by | Status |
|---|---|---|---|---|
| 1 | YX-ORG-01 one legal entity minimum, exactly one default, default never archived | `org-structure.service.ts` createEntity (first = default), setDefaultEntity (advisory lock), archiveEntity/deleteEntity refuse default; migration partial unique index `legal_entities_default_key` + check `default_live_check` | e2e `org-structure.e2e-spec.ts:118,144`; live list shows KFPL "Default", row menu of default has no Make default/Archive (`admin2-entities-desktop-light.png`) | ✅ |
| 2 | YX-ORG-30 country + data region fixed at creation; region live and serving the country | `createEntity` → `regionProblem()`; `updateEntity` refuses change; DB trigger `legal_entities_fixed_region` | e2e :133; unit `org-structure.spec.ts` region catalogue; drawer subtitle "India · data kept in India" (`admin2-entities-add-drawer.png`) | ✅ |
| 3 | P01 §4.1 PAN/TAN/GSTIN/CIN validated formats; GSTIN carries PAN | `dto.ts LegalEntityStatutoryDto` regexes; `setStatutory` gstinMatchesPan; DB CHECKs | e2e :177; yx-ui `statutoryErrors` test | ✅ |
| 4 | P02 §4.4 statutory IDs Confidential: list shows on-file only; values via separate grant; reveal audited (YX-SEC-09) | `legalEntityView` returns booleans; `GET …/statutory` needs `org.entity.statutory.manage` + writes audit `org.legal_entity.statutory_viewed`; `PUT` adds `@RequireStepUp` | live: admin2 sees "All on file / None on file", no Identifiers button, GET statutory → 403; e2e :171,188 | ✅ |
| 5 | US-A-076 AC2 "when they open the identifiers, step-up is asked" | GET has no `@RequireStepUp`; drawer text: "You confirm it's you before saving" (`entities.tsx` StatutoryDrawer) | code read | ⚠️ story says open, build does save |
| 6 | YX-ORG-02 location = one entity; state + timezone mandatory; address structured (YX-ORG-28) | `LocationDto` (address.state required, timezone required), `isTimeZone`, `checkAddress`; DB NOT NULL + state CHECK | live: empty save marks State + Time zone (`admin2-locations-add-errors.png`); e2e :207 | ✅ |
| 7 | Location geofence lat/lng/radius + ip_ranges[] (P01 §4.2, Settings 1.3) | `GeofenceDto` 6-dp, radius 10–5000; CIDR check via ipaddr.js; DB geofence CHECK | live: VALIDATE-Loc stored `{lat:12.2958,lng:76.6394,radiusM:150}`, `203.0.113.0/24`, code auto `VALIDATE-LOC` | ✅ |
| 8 | Location never changes entity (YX-ORG-08 downstream) | `updateLocation` refuses; UI entity select disabled on edit | e2e :221; yx-ui test "entity cannot change" | ✅ |
| 9 | Location holiday_calendar_id, weekly_off_rule_id, map editor (TIM-31) | not built | deferred D-022 (M02) | 🔄 |
| 10 | YX-ORG-04 used masters archive not delete; archived not offered for new assignments; restore | FK NO ACTION → P2003 mapped to "in use, so it can only be archived"; `assertNoSettings`; `listMasters` default excludes archived; restore needs active entity/parent | live archive → restore → archive → delete on VALIDATE-Loc, each confirmed (`admin2-locations-archive-confirm.png`, `…-delete-confirm.png`); e2e :300,459 | ✅ |
| 11 | UI: archive/restore/delete each confirmed (US-A-078) | `org-kit.tsx lifecycleItems` + ConfirmDialog; Delete only shown on archived rows | live menu items: active = [Archive]; archived = [Restore, Delete] | ✅ |
| 12 | YX-ORG-03 no cycles; move moves subtree; materialised path | `departmentParent` path check; `moveDepartment` UPDATE path LIKE; advisory lock; DB `parent_check`, `path_check` | e2e :262; live parent picker for Operations = [People, Sales, Engineering, Finance] (own subtree excluded) | ✅ |
| 13 | P01 Q7 division = top-level label only | DB `division_check`; service refuses parent + division | e2e :251; live Division badge on Operations, Sales | ✅ |
| 14 | US-A-079 parent chosen in a tree view, not a flat list | dropdown (searchable Select) | deferred D-030; story state New | 🔄 |
| 15 | YX-ORG-15 shared / entity-only / limited-to-entities; entity-only child under shared parent OK; shared under entity-only refused | `ownership()`, `departmentParent` owner check, `moveDepartment` misfit check; `listMasters?legalEntityId` OR filter; DB `applies_to_check` | e2e :271,290; UI Segment "Shared / One entity only" + MultiSelect limit | ✅ |
| 16 | YX-ORG-05 codes generated when blank; names + codes unique within scope | `codeFromName`, `takenCodes`; expression unique indexes on COALESCE(owner, org) | live: VALIDATE Desig → code `VALIDATE-DESIG`; duplicate name → "That name or code is already used (YX-ORG-05)" (`admin2-structure-desig-duplicate.png`) | ✅ |
| 17 | Department head (P01 §4.3) | API `headEmployeeId` with YX-SEC-04/11 guards + access audit; **no field in the UI editor** | code read; grep: `headEmployeeId` absent from `structure.tsx` | ⚠️ API only |
| 18 | Grades with rank used by policies | `GradeDto.rank` 1–1000, list ordered by rank | live Grades tab | ✅ |
| 19 | Grade pay ranges per grade × entity × currency, dated, no overlap (YX-HIS-02) | `grade_pay_ranges` GiST EXCLUDE; `createPayRange` closes open range the day before; refuses cutting the past (YX-HIS-07); only future ranges editable/withdrawable | e2e :376,386,397; yx-ui test "Show pay … Withdraw"; story `StructureWithPay` | ✅ (code/tests only) |
| 20 | Pay hidden without `pay.range.view`; every look audited (R1, YX-SEC-07/09) | controller `@RequirePermissions('pay.range.view')`, `ownSession`, `scope.reach`; audit `org.pay_range.viewed`; UI "Show pay" only with canView | live: admin2 no "Show pay", GET pay-ranges → 403; e2e :354,406 | ✅ |
| 21 | Pay-range writes need step-up | `@RequireStepUp` on POST/PUT/DELETE | e2e :364 | ✅ |
| 22 | Correction of a range in force (superseded rows) | refused instead | deferred D-028 | 🔄 |
| 23 | Employment types with 8 categories (YX-ORG-20) | `EMPLOYMENT_CATEGORIES`, DB CHECK; UI Select with labels | live categories list = 8; `admin2-structure-emptype-add.png` | ✅ |
| 24 | Statutory default matrix per category + overrides only where law allows | not built | deferred D-023 (P07) | 🔄 (counted once under #22/#9 group) |
| 25 | Cost centres per entity; parent same entity; no cycles; codes unique per entity | composite FK `(org, entity, parent)`; `costCentreParent` recursive CTE; UI parent list filtered by chosen entity | live parents for KFPL = [Engineering Bengaluru, Finance Bengaluru] only; e2e :333 | ✅ |
| 26 | YX-ORG-16 employee code scope per entity / per tenant; switch blocked while duplicates, clashes listed | `settings-registry employee_code.scope`; `rekeyEmployeeCodes` 409 `EMPLOYEE_CODE_CLASHES` + clashes; `api-client` keeps `clashes` on the error | code; `RulesForm` shows `error` message only | ⚠️ list not rendered |
| 27 | Company rule "New masters are" default ownership | `org.master.default_ownership`; `MasterEditor` pre-selects | live Segment on Legal entities page | ✅ |
| 28 | YX-ORG-12 every setting shows its source scope | `Resolved.source`; UI "Set for your company" / "YukthiX starter, not changed yet" / "from 1 Apr 2026" | live (`admin2-rules-desktop-light.png`) | ✅ |
| 29 | YX-ORG-18 precedence employee > designation > grade > employment type > department > location > pay group > entity > tenant | `SCOPE_ORDER` exactly that | unit `org-structure.spec.ts:552`; e2e :428 | ✅ |
| 30 | Dated settings carry valid_from, resolved as of date never "today" | `resolve` 400 without asOf for dated key; `set` requires validFrom | live API: `resolve?key=attendance.mode` → 400 with plain message; with asOf → source row | ✅ |
| 31 | Dated value in force never rewritten; scheduled values editable (YX-HIS-07) | `set`/`remove` 409 when validFrom ≤ today; UI Remove only on future rows | yx-ui test; live Hosur plant row "Timesheet · 6 Nov 2026 · Scheduled" | ✅ |
| 32 | attendance.mode + missing_punch_effect scoped entity/location/department/employment type, dated (D1) | registry | live rows company / Bengaluru / Hosur | ✅ |
| 33 | Retro limit setting (YX-HIS-12), guarded | `employee_change.retro_limit` current_fy / previous_fy, guard access.role.manage | live "Start of this financial year · Set for your company" | ✅ |
| 34 | Probation rules per type/grade: length, review lead, max total, auto-confirm off (M01 §3.4, C12 starters 6/15/12/off) | four `probation.*` keys with those defaults and scopes | live Probation block | ✅ |
| 35 | Entity-specific overrides editable from the screen (US-A-079 AC2/3) | Company rules page editor "Applies to" entity/location/department/type/grade | live Change drawer (`admin2-rules-change-drawer.png`) | ✅ (D-031 now superseded by the Company rules page; story still New) |
| 36 | Settings guarded keys need access.role.manage (YX-SEC-02) | `settingGuard`; UI disables Change with reason | yx-ui + web tests; live admin2 holds the guard, all 7 Change enabled | ✅ |
| 37 | Audit in same transaction for every change (US-A-078) | `audit()` inside `inCompany` tx everywhere | code read | ✅ |
| 38 | `org.master.changed` event (P01 §7) | not emitted (audit only) | deferred D-029 | 🔄 |
| 39 | Navigation only shows pages the person may open (YX-SEC-01) | layout: Org menu for settings admins, pay viewers, HR with structure.view; Company rules only for settings.manage | live: plant-hr sees Legal entities/Locations/Structure read-only, no Company rules; consultant sees none and gets No-access state on direct URL | ✅ |
| 40 | Entity close / merge wizard (YX-ORG-22, Settings 1.2) | not built | plan wave 4 | 🔄 |
| 41 | YX-ORG-14 RLS on every new table | migration DO block, 9 tables | migration read | ✅ |
| 42 | Settings › Organisation screens load from API, no-access and error states | `OrgPage` states; web `loadState` | web tests; live consultant → "no access" | ✅ |

(Status totals above count rows 1–42 excluding duplicate-grouped lines: ✅ 29 · ⚠️ 5 (5, 17, 26 plus UI items below) · ❌ 1 (first-keystroke bug, §2) · 🔄 3 groups of later-wave work: 9/22/24, 14, 38/40.)

## 2. UI findings

| Sev | Screen | Issue | Evidence |
|---|---|---|---|
| **High** | All forms (sign-in, every org drawer) | **First keystroke into an empty field is dropped**; programmatic `fill` is ignored. Typing "VALIDATE-Loc" yields "ALIDATE-Loc"; sign-in email lost its first letter and produced a "Wrong email or password" attempt. Reproduced 10/10 in Chrome (Playwright) on `/yx/sign-in` and the Add location / Add designation drawers. Appeared with commit `c95e2bf1` (8 Oct 20:25) which adds `onInputCapture → setTyping(true)` on `FormField` (`packages/yx-ui/src/components/field.tsx:92-96`); the state update in the capture phase re-renders the controlled input before its `onChange` runs. Console also logs "flushSync was called from inside a lifecycle method". Must fix before the manual test round. | `admin2-landing.png` (first run: "dmin2@demo-org.test"), script log `WARN typed value mismatch` |
| Med | Company rules › Change drawer | Single-choice value (2–3 options: Attendance mode, Missing punches, retro limit, who-accessed) is a dropdown, not the joined Segment control the design system requires for pick-one. Same for "Applies to" (≤5 scopes). | `admin2-rules-change-drawer.png` |
| Med | Locations › Add/Edit | Time zone is a free text box ("Asia/Kolkata"); the plan's location page lists it as a chosen value. Typos are only caught at save ("Enter a time zone such as Asia/Kolkata"). Should be a searchable Select of IANA zones (India: one entry pre-selected). | `admin2-locations-add-errors.png` |
| Med | Legal entities › Company rules | Switching codes to "Across the company" when codes clash shows only the sentence; the API's list of clashing people/entities (`clashes`) is not rendered, although `api-client.ts:79` keeps it on the error. MT-3-06 expects the list. | `entities.tsx` RulesForm `error` |
| Med | Structure › Departments | Department head (plan §4.3, P02 YX-SEC-04 implicit grant) has API support but no field in the editor; it can only be set by API. | `structure.tsx` MasterEditor |
| Med | Legal entities list | Plan (MT-3-01) and story world expect "India · data kept in India" per entity; the list shows no country/region at all (only the Add drawer subtitle). With one live region this is cosmetic, but the data region is a fixed, important fact and should be visible per row. | `admin2-entities-desktop-light.png` |
| Med | Org screens, plant HR scope | HR for the plant (plant-hr@, `org.structure.view` only) reads **all** entities and locations (KFPL, KFPL-TN, KTEST; 4 sites) — reads are company-wide by design (Public/Internal class), writes are entity-scoped. Acceptable per P02 §4.4, but note the UI gives no hint of the person's own entity. | script log `plant-hr GET /org/legal-entities → 200 [KFPL, KFPL-TN, KTEST]` |
| Low | Locations list | Sites are sorted by name, not grouped under their legal entity (MT-3-07 "under its legal entity"); entity shown as secondary text only. | `admin2-locations-desktop-light.png` |
| Low | Structure › Grades | Grade names carry the code twice ("W1 · Plant worker" + tag `W1`) in demo data; cosmetic, data not UI. | `admin2-structure-grades.png` |
| Low | Company rules | Value tables repeat "Applies to / Value" headers per rule; on 390 px each rule becomes a card stack that is long but readable; no overflow. | `admin2-rules-390-light.png` |
| Low | Legal entities | Add drawer "Currency" is a free 3-letter text box; a Select (INR default) would prevent typos. | `admin2-entities-add-drawer.png` |
| Low | Console | `flushSync was called from inside a lifecycle method` warning on every org page (React), plus one 401 from `/people/me` on landing (expected for non-employee admins). | `admin2-console-errors.txt` |

Checked and fine: breadcrumbs "Organisation › Legal entities / Locations / Structure / Company rules" match the menu labels; no horizontal scroll at 390 px on any of the four pages, light and dark; dark theme renders correctly (`*-dark.png`); every button has pointer cursor and border/fill (`admin2-affordance.json`); no field error shows while typing — errors appear on Save with a "Fix these before saving" summary linking to fields; tree rows show elbow lines (`admin2-tree-elbow.png`, 3 elbows under Operations) with chevron + "3 under it"; calendar has YukthiX month and year selects (`admin2-rules-change-calendar.png`); Scheduled badge on the 6 Nov Hosur row; plain-English copy throughout ("Pay is private. Opening this list is recorded…", "It can no longer be chosen. People who have it keep it.").

## 3. Manual tests MT-3-01…19 vs built behaviour

| Test | Status | Why |
|---|---|---|
| MT-3-01 | ⚠️ stale | List shows no "India – data kept in India" per entity; only the Add drawer subtitle says it. Either add the column (finding above) or change the expectation. |
| MT-3-02 | ⚠️ stale | Step 3–4 (wrong PAN in the Add drawer) can't be done: PAN/TAN/GSTIN/CIN live in the separate **Identifiers** drawer, visible only to `org.entity.statutory.manage` holders (payroll@), with step-up on save. Move the PAN steps to MT-3-05 or a new payroll-account test. |
| MT-3-03 | ✅ current | Make default via row menu with confirm "New hires and imports start with this entity." |
| MT-3-04 | ✅ current | admin sees "All on file / None on file", no Identifiers button (verified live). |
| MT-3-05 | ⚠️ wording | Step 3 "Confirm it's you" happens on **Save identifiers**, not on opening. Opening is recorded (audit) without step-up. |
| MT-3-06 | ⚠️ partly stale | Save works; "clashes are listed" is not true in the UI (only the message). Expected text should say "the message says codes clash" until the list is rendered. |
| MT-3-07 | ✅ current (note) | Mysuru office already exists in live data from an earlier run (and KTEST entity) — the test will hit "name already used"; use a fresh name or reset data. Sites are not grouped by entity. |
| MT-3-08 | ✅ current | Verified live: State and Time zone marked on save. |
| MT-3-09 | ⚠️ stale | Step 3 "Try Delete on Hosur plant": Delete is offered only on **archived** rows; an active used location shows Archive only. Rewrite: archive first (confirm), tick Show archived, Delete → refused "It is in use, so it can only be archived". |
| MT-3-10 | ⚠️ stale | Step 3 (set Operations' parent to its own child): the parent picker excludes Operations and its subtree, so the loop cannot be attempted; refusal is API-only. Rewrite expectation: "Packaging and the other sub-departments are not offered as parent". |
| MT-3-11 | ✅ current | Verified live (code generated, duplicate refused). |
| MT-3-12 | ✅ current | hr@ has no `pay.range.view` → no Show pay (same as admin2 live). |
| MT-3-13 | ✅ current | Matches code: "Pay is private…" alert, In force / Starts in N days badges, overlap refused. |
| MT-3-14 | ✅ current | "Fixed-term (plant)" → "KFPL-TN only" (ownership column). |
| MT-3-15 | ⚠️ stale | The parent list only offers cost centres of the chosen entity, so "Hosur production" cannot be picked for KFPL; the refusal exists only in the API/DB. Rewrite as a positive check of the filtered list. |
| MT-3-16 | ⚠️ stale | Step 1 "choose Delete" on an active designation: Delete appears only after Archive. Rewrite: Archive → Show archived → Delete refused (in use) → Restore. |
| MT-3-17 | ✅ current | Verified live: company Punch, Bengaluru "Present unless on leave". |
| MT-3-18 | ✅ current | A Hosur row dated 6 Nov 2026 already exists from an earlier run; the test should pick another future date or another location. |
| MT-3-19 | ✅ current | Retro limit is a guarded setting: works for admin@ (holds access.role.manage). |

## 4. Stories

**Done stories whose acceptance isn't visible / fully met**
- **US-A-076** (Done): AC "when they open the identifiers, then step-up is asked" — built: step-up on save only; the read is audited. Decide: amend the story to "audited read, step-up on change" or add `@RequireStepUp` to `GET …/statutory`.
- **US-A-073** (Done): all four ACs built; the "entity-only master used for another entity's employee is refused" part is enforced in the people module, not visible on these screens (fine).
- **US-A-075** (Done): pay-range ACs verified by tests only; no demo account in this validation could open the drawer. OK, but note the Grades tab offers no hint to payroll users that ranges exist until they click Show pay.
- **US-A-099** (Done, AC2 clashes listed): API lists; UI doesn't (finding above).

**Built things with no story**
- Department head on departments (API, YX-SEC-04 implicit grant, access audit) — no story in FT-A-030; D-021 says it was not added, but it is now built in the API.
- Company rules page (Settings › Organisation › Company rules) with per-scope overrides and the Access & privacy page — covers US-A-079 AC2/AC3 and D-031, yet US-A-079 is still "New" and D-031 still open. Update the tracker.
- Settings guard keys (`guard: access.role.manage`) and the "control change" audit flag — no story (P02 §4.2 / YX-SEC-02 reference only).
- `GET /org/reference` (states, regions) — utility, no story needed.

**Stories still New that this area depends on:** US-A-079 (tree parent picker remains open after the rules page closed the settings half).

## 5. Cleanup
Created and removed during the pass: location `VALIDATE-Loc` (archived → restored → archived → deleted), designation `VALIDATE Desig` (archived → deleted). Verified via `GET /org/locations?includeArchived=true` and `GET /org/masters/designations?includeArchived=true`: neither remains. Pre-existing test leftovers **not** touched: entity `KTEST`, location `Mysuru office`, Hosur attendance row dated 6 Nov 2026, "Packaging" department. No company rules, lockout, default entity or existing demo records were changed. One failed sign-in attempt was recorded for the non-existent address `dmin2@demo-org.test` (first-keystroke bug), none for admin2.
