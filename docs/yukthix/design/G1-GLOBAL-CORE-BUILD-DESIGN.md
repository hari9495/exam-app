# G1 · Global core: build design

> **Status:** build design for batch G1, 10 Oct 2026. Source: [GLOBAL-HCM-GAP-PASS](GLOBAL-HCM-GAP-PASS.md) §6, §7 and §7.1 (founder accepted all 13 decisions on 10 Oct 2026).
> **Gap pass items:** C1 working hours and FTE, C3 three service dates, G3 country person fields (data only), T1 leave pay steps (data shape only), G1 translating company words (hi / ta / te), G6 the "Add a country" guide.
> **Builds on:** [P21](P21-global-readiness.md) (regions, packs, gates), [P07](P07-statutory-rules-as-data.md) (law as dated data), [P06](P06-effective-dated-history.md) (dated job facts), [P01](P01-tenancy-and-organisation.md) (entities, locations, scoped settings), [M01](M01-core-hr-and-lifecycle.md) (job changes, rehire), [M02](M02-leave-and-attendance.md) (leave types).
> **Branch:** `feat/yukthix-global-g1`, migration `20261102000000_global_g1` (after lifecycle 6f's `20261101000000_lifecycle_6f`). Core HR, settings and country packs only: no change to journeys (6f) or payroll (5d).

---

## 1. What we build and what we do not

| Gap | In G1 | Not in G1 (later) |
|---|---|---|
| C1 hours and FTE | Hours a week on every job, dated like every job fact. Empty = full-time. The company's normal week comes from a setting, else the country pack. FTE % is computed, never typed. | Leave accrual and pay pro-rating by FTE (needs the payroll batch; the FTE is ready for it). |
| C3 service dates | Company start and this employer's start are read from the employments we already store (never copied). Continuous service from is new: filled from the rehire choice, HR may change it with a reason. | Rules that read a date by name (gratuity, notice, awards) switch to these dates in their own batches. |
| G3 person fields | Each country pack lists every person field as required, optional or not allowed. India is the first pack. A read API gives the list for a country. | Hiding fields on the profile and blocking custom fields per country. |
| T1 pay steps | Leave types carry pay steps (days at a pay %) and a window (leave year or rolling 12 months). A tested calculator says which days are paid at which %. | The leave type screen and the "Days 11–15 at 50 %" line on the leave form. |
| G1 translations | A company translates its own words into Hindi, Tamil and Telugu: leave types, job titles, departments, grades, employment types, locations, journey names and journey steps. People see their language, else the company's words. | An export / import file for translators; AI draft translations. |
| G6 Add a country | A guide: country → legal entity → identifiers and registrations → working week and language → what is still open. India is set up through it. | Data region choice beyond India, holiday feeds, starter leave and time rule templates per country (T2, T4), payroll mode choice. |

## 2. Country pack data (P07)

A country pack is a P07 rule set: global, dated, read-only to the app, with its source and a verify flag, published by YukthiX staff (maker ≠ checker). G1 adds one statute, **`<CC>.PACK`** (kind `country_pack`), for the country itself. India's is `IN.PACK` version `2026-v1`, loaded by the G1 migration.

```json
{
  "kind": "country_pack",
  "name": "India",
  "currency": "INR",
  "fyStartMonth": 4,
  "dataRegion": "IN",
  "normalWeekHours": "48",
  "languages": ["en", "hi", "ta", "te"],
  "entityIds": [{ "key": "pan", "required": true }, { "key": "tan", "required": true }, { "key": "gstin", "required": false }, { "key": "cin", "required": false }],
  "registrations": ["IN.PF", "IN.ESI", "IN.PT", "IN.LWF"],
  "personFields": { "legalName": "required", "dateOfBirth": "required", "...": "..." }
}
```

- `normalWeekHours`: the most a full-time week may be by law (India: 48 hours, Factories Act 1948 s.51; OSH Code 2020 s.25). A company with a shorter normal week sets it (§3).
- `personFields`: every field in the YukthiX person-field catalogue, each `required`, `optional` or `not_allowed`. A field not in the catalogue is refused when the pack is read.
- No figure in this shape lives in code (YX-GLB-16). The code knows field names and kinds, never a country's values.

**India person fields (verify = true until the compliance owner confirms):** legal name, date of birth and gender are required; PAN is required (income tax); marital status, nationality, father's or spouse's name, disability, blood group, Aadhaar, UAN, ESIC number and passport are optional (Aadhaar is never forced on a private employer); religion, caste category and ethnicity are **not allowed**; national IDs of other countries (social security number, national insurance number, Emirates ID) are not allowed.

## 3. Working hours and FTE (C1)

- `employee_assignments.hours_per_week` (NUMERIC(4,1), NULL). NULL means **full-time**: a company that never types hours sees no change.
- It is a job fact (P06): set at joining, changed by **"Employment type or hours"** (the existing `employment_type_change` type now also carries the hours) or by a correction, never edited in place.
- The **normal week** for a job: the setting `work.normal_week_hours` (company, legal entity or location; values 35 to 48, or "From the country pack", the starter) resolved for the job's location, else the pack of the location's country.
- **FTE %** = hours ÷ normal week × 100, rounded to 2 places; 100 % when the hours are empty. Hours above the normal week are refused (overtime is time data, not the contract).
- The person's record shows "Hours a week: 24 (50 % of a 48-hour week)".

## 4. Service dates (C3)

| Date | Where it comes from |
|---|---|
| **Company start** | The first joining day of the person's employee record in this company (the earliest `employments.joined_on`). Not stored again. |
| **This employer start** | `joined_on` of the current employment. Not stored again. |
| **Continuous service from** | `employments.continuous_service_from` when HR set it, else from the rehire choice saved at joining (lifecycle 6e): *fresh* → this employer start; *continuous* → the earlier employment's continuous service date; *break counted* → this employer start moved back by the days served before. With no earlier employment: this employer start. |

HR (employee.change.manage) may set continuous service with a reason (3+ characters); clearing it goes back to the rule above. It may not be after this employer start. Every change is audited (`employee.service_dates.changed`). The person and their managers see the three dates where they see the record.

## 5. Person fields per country (G3)

Data only in G1. `GET /global/countries/:code` returns the pack with `personFields`. A per-person list (the person's work country) and the screens that use it come in a later batch.

## 6. Leave pay steps (T1)

Two new keys in a leave type's `rules`:

| Key | Shape | Default |
|---|---|---|
| `paySteps` | `[{ "days": 10, "percent": 100 }, { "days": 20, "percent": 50 }]`: 1 to 5 steps, days in half days (0.5 to 366), percent 0 to 100 whole numbers; days after the last step are unpaid | `null` (the type is paid or unpaid as a whole, as today) |
| `payWindow` | `leave_year` or `rolling_12_months`: which earlier days count toward the steps | `leave_year` |

Only a paid type may have steps. Editing a type keeps its steps unless the request names them (the leave type screen does not show them yet). `payStepsFor(steps, daysTakenInWindow, daysAsked)` returns the paid parts, e.g. 6 days asked after 8 taken with 10 at 100 % then 20 at 50 %: days 9–10 at 100 %, days 11–14 at 50 %.

## 7. Languages and translations (G1)

- Setting **`people.language`** (company, legal entity or person; values `en`, `hi`, `ta`, `te`; starter `en`). The company value is the **company default**: the language its own words are typed in. A person picks their own language on **Me › Language** (any signed-in employee; it saves a person-scope value, audited).
- Table **`content_translations`**: one row per company, subject type, subject id and language, with the text (1–150 characters). Subject types: `leave_type`, `designation`, `department`, `grade`, `employment_type`, `location`, `journey_template`, `journey_task`. Forced RLS; no foreign key (one table serves eight subjects), the API checks the subject belongs to the company.
- **Shown:** the reader's language when a translation exists, else the company's words. Used on the job record (designation, department, grade, employment type, location), on My leave (leave type names), and, with lifecycle 6f merged, on the journey page, My checklist tasks and My first 30 days (journey names and step titles; a step is matched to its template step by its key). The template editor keeps the company's own words.
- **Settings › Organisation › Translations** (org.settings.manage): pick what to translate, one box per language other than the company default. An empty box removes the translation.

## 8. "Add a country" guide (G6)

Table **`country_setups`** (forced RLS): company, country, legal entity (composite key to `legal_entities`), status (`in_progress` / `done`), who and when, version. One guide per legal entity.

| Step | What happens | Uses |
|---|---|---|
| 1 Country | Choose from the published country packs. Only countries with a pack can be chosen; the pack summary is shown (currency, financial year, normal week, languages, registrations). | `GET /global/countries` |
| 2 Legal entity | Create one with the pack's currency, financial year and data region filled in, or choose an existing entity of that country. | existing `POST /org/legal-entities` |
| 3 Identifiers and registrations | The entity's tax identifiers (the existing confidential form, with step-up). Registrations (PF, ESI, PT, LWF) are set in Payroll › Set-up; the guide links there. | existing endpoints |
| 4 Working week and language | Normal week for this entity (pack value or a company value) and the entity's language. | `PUT /org/settings` |
| 5 What is still open | A live list: entity, required identifiers, each registration decided, a location, a holiday calendar, a leave policy. Each open item links to the screen that closes it. "Finish" is allowed with items open. | `GET /global/country-setups` |

India is configured through the guide: the demo company's India entity has a finished guide in the seed, and the e2e test runs the whole guide for a new entity.

## 9. API (all under `/global`, JWT + permissions guard)

| Route | Permission |
|---|---|
| `GET /countries`, `GET /countries/:code` | org.structure.view or org.settings.manage |
| `GET/POST /country-setups`, `PUT /country-setups/:id`, `POST /country-setups/:id/finish` | org.settings.manage |
| `GET /translations?subjectType=`, `PUT /translations` | org.settings.manage |
| `GET/PUT /me/language` | signed in, own session (not while acting for someone) |
| `GET/PUT /people/employees/:id/service-dates` | read: as the job record; write: employee.change.manage, own session |

## 10. Slices (PR-sized, with tests)

| ID | Slice | Tests |
|---|---|---|
| G1.01 | Country pack `IN.PACK` (migration), pack parser and person-field catalogue, `GET /global/countries`, `/countries/:code` | unit: the parser refuses a field outside the catalogue, a bad rule, a bad normal week; e2e: India pack listed and read |
| G1.02 | Hours a week on the job: column, change types, setting `work.normal_week_hours`, FTE in the record, hire form and change drawer field | unit: payload rules (hours only on join, employment type or hours, correction), fold, FTE maths; e2e (employee-history suite): part-time join shows 50 %, a dated hours change, hours above the normal week refused; yx-ui: change input |
| G1.03 | Service dates: column, derivation, read and HR edit with reason | unit: fresh / continuous / break counted chains, override; e2e: HR override audited, a date after employer start refused, a manager cannot edit, clearing goes back to the rule |
| G1.04 | Person fields in the country pack API | e2e: India pack: PAN required, Aadhaar optional, religion not allowed |
| G1.05 | Leave pay steps in leave type rules and the calculator | unit: steps, window counting, unpaid tail, invalid shapes (unpaid type with steps, more than 5 steps); e2e: steps saved and kept when a type is edited without them |
| G1.06 | `language` setting, Me › Language, `content_translations`, translations screen, translated names on the job record and My leave | unit: fallback order; e2e: Tamil reader sees the Tamil leave name, English reader the company's words; HR saves and clears a translation; a subject from another company refused; RLS |
| G1.07 | `country_setups`, guide API and screen, India through the guide, seed | e2e: the whole guide for a new India entity, checklist items open and closing, one guide per entity, RLS isolation; Playwright: the guide, translations and the record |

**RLS:** `content_translations` and `country_setups` are added to the RLS isolation suite (forced, one policy, A cannot read, change or plant B's rows; a setup cannot point at B's entity).

## 11. Security

- Both new tables: `organization_id NOT NULL`, composite keys, forced RLS with `tenant_isolation`; no delete or truncate for `country_setups` (`content_translations` rows are removed by "clear").
- Pack rule sets are read-only to the app (P07). The guide never writes registrations or identifiers itself; it calls the existing endpoints, which keep their own permissions and step-up.
- Translations are plain company wording (Internal), shown to anyone who sees the subject; the text is trimmed and length-checked, rendered as text (no HTML).
- A person's language is theirs: only the person (own session) or org.settings.manage may set it.

## 12. Decisions for the founder (G1)

1. **Person fields for India.** Religion, caste category and ethnicity are "not allowed" in the India pack; Aadhaar is optional, PAN required. *Recommended:* keep as written; the compliance owner confirms (verify flag).
2. **Company start for people from an acquired company.** Company start is read from their first employment with us; acquired service is entered as "continuous service from". *Recommended:* yes; add a separate override only if a customer asks.
3. **Part-time leave and pay.** FTE is stored now; leave accrual and pay pro-rating by FTE wait for the payroll batch. *Recommended:* yes.

### 12.1 Founder answer (10 Oct 2026)

All three accepted as recommended:

| # | Decision |
|---|---|
| 1 | India person fields: religion, caste category and ethnicity are not allowed; Aadhaar is optional; PAN is required. The compliance owner confirms the pack values. |
| 2 | Acquired staff: earlier service goes in "continuous service from"; company start stays the first day with us (no separate override). |
| 3 | Part-time leave and pay pro-rating by FTE waits for the payroll batch; G1 stores hours and FTE only. |

## 13. Change log

| Date | Change |
|---|---|
| 10 Oct 2026 | First version: slices G1.01–G1.07 from the gap pass §7.1. |
| 10 Oct 2026 | Founder accepted decisions 1–3 as recommended (§12.1). |
| 10 Oct 2026 | After lifecycle 6f merged: translated journey names and steps shown on the journey screens (§7). |
| 10 Oct 2026 | As built: the language setting is `people.language` (setting keys need a dot); person fields are read from the country pack API (no per-person route yet); the rehire chain is covered by unit tests. |
