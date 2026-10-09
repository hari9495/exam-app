# P01 · Tenancy & Organisation Model

> **Status:** ✅ Decided, 24 Sep 2026. All 8 questions answered (§11). **Validation pass 3 Must (J15), founder decision 28 Sep 2026:** one `persons` record per tenant with role attachments, matching / merge rules, conversions with history, total-workforce view (§4.5a, YX-ORG-26 / 27); §11 J15. **Validation pass 3 Shoulds (G3, R7, G9 + S16), founder decision 28 Sep 2026:** structured names, addresses and phones (YX-ORG-28), inclusive gender list (YX-ORG-29), region catalogue and data region per legal entity (YX-ORG-30); see [P21](P21-global-readiness.md); §11 G3 / G9.
> **Covers:** spec §2.1.1 (tenant & organisation set-up), D3 (shared DB + RLS), D5 (India first, global later), D10 (Postgres), D11 (inside the exam app).
> **Everything else depends on this:** every HR record hangs off a tenant, a legal entity, a location and an employee assignment.

---

## 1. Purpose & scope

This doc defines:
- how one YukthiX customer (tenant) is isolated from others on Postgres;
- how a customer's **organisation** is modelled: companies (legal entities), work locations, departments, designations, grades, cost centres, employment types;
- the core **Employee** identity and its **assignment** (who works where, in what role, under whom, from when);
- **scoped settings**: one place to hold configuration per tenant / entity / location, instead of ever-growing settings tables.

**Out of scope here:**
- Roles and visibility (P02).
- Full effective-dated history mechanics (P06). This doc defines the assignment table P06 generalises.
- Statutory rates (P07).

---

## 2. What exists today (exam app, `origin/main`)

| Area | Today | Keep / change |
|---|---|---|
| Tenant | `Organization` (`organizations`): name, slug, region, status, branding, plan, and **~70 config columns** (SMTP, AI keys, SAML, careers, SMS/WhatsApp, HRIS export, reminders…) | **Keep** as the tenant. **Stop adding columns:** new config goes to scoped settings (§4.6). |
| Tenant key | `organizationId` / `organization_id` on tenant-owned tables | Keep the name (Q1). |
| Isolation | SQL Server RLS function `fn_tenant_access_predicate` on ~61 tables. `TenantPrismaService.forTenant()` opens a transaction and sets `SESSION_CONTEXT` keys: `app_current_org`, `app_is_super_admin`, `app_current_user`, `app_record_visibility_governed`. Fail-closed (no context → no rows). | **Port** the same pattern to Postgres (§5). |
| Gaps | Child tables (`attempts`, `answers`, `invitations`, `results`, `proctoring_events`) have **no org key and no RLS**; they rely on parent checks in services | **Fix during the Postgres migration:** org key + RLS on every tenant table. |
| Org structure | None. `Job.department` is free text. `User.managerId` is the only hierarchy. | **New:** legal entities, locations, departments, designations, grades, cost centres (§4). |
| People | `User` = staff login (email, role string, manager, permission profile). `Candidate` = applicant. **No employee.** | **New `Employee`**, linked 0..1 to a `User` (§4.4). |
| Super admin | Session flag + platform console; standing switch-in to any tenant's data | **Change:** no blanket RLS bypass. Platform staff reach tenant data only through P02 YX-SEC-20 support sessions (tenant-approved, time-boxed, restricted areas excluded; P02 Q8, M08 Q4); platform billing/ops views stay; every support-session read audited (P08). |

---

## 3. Concepts

| Term | Meaning | Example (demo) |
|---|---|---|
| **Tenant** | One YukthiX customer account: subscription, users, branding, data boundary | "Workfox Group" |
| **Legal entity** | A registered employer with its own PAN/TAN/GSTIN, statutory registrations, financial year, currency, payroll | "Workfox Pvt Ltd", "Workfox Services LLP" |
| **Location** | A work site of one legal entity. Its **state** decides PT/LWF, its **holiday calendar** and **timezone** apply to people there, and it carries the geofence. | Hyderabad HQ (Telangana), Chennai Office (Tamil Nadu) |
| **Department** | A functional unit in a tree | Sales › Chennai Sales |
| **Designation** | Job title | Sales Representative |
| **Grade / band** | Pay and policy level | G3 |
| **Cost centre** | Where cost is booked (per legal entity) | CC-SALES-TN |
| **Employment type** | Permanent, probation, contract, intern, consultant… | Permanent |
| **Employee** | A person's HR record in the tenant | Priya Sharma |
| **Employment** | One continuous period with one legal entity (join → exit). A person rejoining, or moving to another entity, gets a new employment. | Priya @ Workfox Pvt Ltd, 2 Aug 2021 → |
| **Assignment** | Dated slice of an employment: location, department, designation, grade, manager, cost centre, type. Changes by promotion or transfer. | From 24 Sep 2026: Manager, Sales, Chennai, reports to Ananya |
| **Scope** | Where a setting applies: tenant > entity > pay group > location > department > employment type > grade > designation > employee (§4.6) | Leave year = FY for entity A |

```
Tenant
 ├─ Legal entity (PAN, TAN, FY, currency, country)
 │    ├─ Location (state, timezone, holiday calendar, geofence)
 │    └─ Cost centre
 ├─ Department tree · Designations · Grades · Employment types   (shared or entity-only, Q3)
 └─ Employee (person)
      └─ Employment (per entity: join/exit, employee code)
           └─ Assignment (effective-dated: location, dept, designation, grade, manager, cost centre, type)
```

---

## 4. Data model (Postgres)

**All tables:**
- `organization_id uuid NOT NULL`, which is the tenant key (Q1);
- `id uuid` as the primary key;
- `created_at`, `updated_at`, `created_by`;
- soft delete where records can be referenced (`archived_at`), never hard-deleted once used.

### 4.1 Legal entity — `legal_entities`
- `name`, `short_name`, `country` (ISO), `currency`
- `fy_start_month` (1–12; India = 4)
- `registered_address` (structured, YX-ORG-28)
- `data_region` (region catalogue code, YX-ORG-30; P21)
- India identifiers: `pan`, `tan`, `gstin`, `cin`. These are validated formats. Other countries' identifiers go in a country-pack JSON validated by P07.
- `status`, `is_default`
- Unique: `(organization_id, short_name)`.

Statutory registrations (PF establishment code, ESIC code, PT/LWF per state) live in `statutory_registrations (legal_entity_id, statute, state?, number, valid_from)`, detailed in M03 / P07.

### 4.2 Location — `locations`
- `legal_entity_id` (**one entity**), `name`, `code`
- `address` (structured, YX-ORG-28; `state` = ISO 3166-2 subdivision, `country` = ISO 3166-1), `timezone`
- `holiday_calendar_id`, `weekly_off_rule_id` (M02)
- `min_wage_zone` (statutory zone for minimum wages, P07)
- geofence: `lat`, `lng`, `radius_m`, `ip_ranges[]`
- `status`

### 4.3 Structure masters

| Table | Key columns | Notes |
|---|---|---|
| `departments` | `name`, `code`, `parent_id`, `head_employee_id`, `path` (materialised path for tree queries), `is_division` (label only, Q7) | No cycles; shared or entity-only (Q3) |
| `designations` | `name`, `code`, `job_family` | |
| `grades` | `name`, `code`, `rank` (ordering) | Used by policies (leave, expense, travel) |
| `grade_pay_ranges` | `grade_id`, `legal_entity_id`, `currency`, `min`, `mid`, `max`, `valid_from`, `valid_to` | Dated pay ranges per grade × entity × currency, effective-dated per P06; used by comp review (M06 Q6) and the offer range check (M10 Q3) |
| `cost_centres` | `legal_entity_id`, `name`, `code`, `parent_id` | Per entity |
| `employment_types` | `name`, `code`, `category` (permanent / probation / fixed-term / intern / apprentice / consultant / deployed contractor / retired re-employed) | `category` drives statutory and policy defaults through the **statutory default matrix** (YX-ORG-20) |

**Statutory default matrix (E6).** Each employment-type category maps to default applicability of PF, ESI, PT, LWF, statutory bonus and gratuity. The defaults come from P07 (e.g. `IN.APPRENTICE`: no PF / ESI / bonus / gratuity; retired re-employed: no EPS, per `IN.PF`), never from code. A company may override a default only where the law leaves the choice (e.g. voluntary PF for an excluded employee); where the law makes a statute mandatory or excluded, the override is blocked (YX-ORG-20). The per-employee result is stored as dated statutory flags (P06 §4.1).

**Ownership (Q3):** departments, designations, grades and employment types carry:
- `owner_legal_entity_id`: null = **shared** across the tenant; set = **entity-only**;
- an optional `applies_to_entities[]` that limits a shared record to some entities.

An entity-only department may sit under a shared parent. Names are unique within their scope (tenant-wide for shared, per entity for entity-only).

**Code rule:** the system generates codes if the customer doesn't supply them. Codes are unique within the record's scope (shared → tenant, entity-only → entity) and never shown to employees where a name exists (UI brief principle 6).

### 4.4 Employee, employment, assignment

**`employees`** (the person)
- `person_id` (P01 `persons`, unique): the tenant-wide person this employee record belongs to (§4.5a, J15)
- names (first, middle, last, preferred), gender, date of birth, personal email, mobile, photo
  - **structured names (G3, YX-ORG-28):** `given_name`, `family_name`, optional `patronymic` / father's name and grandfather's name, `name_order` (given-first / family-first), legal name per script (Latin + native script, e.g. Arabic), `preferred_name`; display and sort use the locale's format
  - **gender (YX-ORG-29):** value from the tenant gender list (starter: female, male, transgender, non-binary, prefer not to say)
  - **addresses and phones (G3):** structured address rows (ISO 3166-1 country, ISO 3166-2 subdivision, country-template lines, postal code); phones stored in E.164
- `user_id` (nullable, unique): the login
- `status` (derived: onboarding / active / serving notice / exited)
- Sensitive IDs (PAN, Aadhaar, UAN, bank) live in a separate **encrypted** table `employee_identifiers`, governed by P02.

**`employments`** (a period with one employer)
- `employee_id`, `legal_entity_id`
- `employee_code` + `code_scope_key` (Q4). The tenant setting `employee_code.scope` is `legal_entity` (default) or `tenant`; `code_scope_key` = the entity id or the tenant id accordingly. Unique `(organization_id, code_scope_key, employee_code)`, so one constraint serves both modes. The pattern (prefix, running number, optional year) is set per entity or per tenant; imported codes are kept and the sequence continues after the highest.
- `joined_on`, `confirmed_on`, `notice_period_days`, `exited_on`, `exit_reason`
- `contract_end_on` (fixed-term, intern, apprentice; E6): source of the P04 "contract end" reminder; changed only through a dated extension / conversion change (P06)
- `rehire_of` (previous employment id): set when an ex-employee is rehired; the new employment sits on the **existing** employee record (no new person, no PAN-duplicate failure) and applies the rehire continuity options (YX-ORG-19)

**`employee_assignments`** (dated slices)
- `employment_id`, `valid_from`, `valid_to` (null = open)
- `location_id`, `department_id`, `designation_id`, `grade_id`, `employment_type_id`
- `skill_category` (unskilled / semi-skilled / skilled / highly skilled; drives the P07 minimum-wage check) and optional `min_wage_schedule` (industry schedule)
- `manager_employee_id`
- dotted-line (secondary) managers in child table `assignment_dotted_line_managers (assignment_id, manager_employee_id)` (M01 Q5): visibility and feedback only; not in approval chains unless a policy names them
- cost centres in child table `assignment_cost_centres (assignment_id, cost_centre_id, percent)`: the rows must total 100 %; normally one row at 100 % (Q8)
- `change_reason` (join / promotion / transfer / deputation / correction…), `source_ref` (the request that caused it)
- **host posting** (deputation / secondment / client-site posting; E8): `posting_type` (none / deputation / secondment / client site), `host_legal_entity_id` or `host_client_id`, `host_location_id` or a client-site address with state and geofence, `recharge_to_legal_entity_id` + `recharge_flag` (cross-entity cost recharge). The employment (employer for PF / ESI / TDS) is unchanged; the host location, when set, drives holiday calendar, PT state and geofence (YX-ORG-21)

Postgres constraint: `EXCLUDE USING gist (employment_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&)`, so **no overlapping slices**.

### 4.5 Users vs employees vs candidates
- **User** = a login. Staff and admins may have no employee record (e.g. an external recruiter or accountant); employees get a user when self-service is enabled.
- **Candidate** stays separate as a role record, linked to the same `persons` row (§4.5a). An accepted offer leads to an Employee + Employment + first Assignment linked to `candidate_id`, following the entity's hand-off mode (M10 Q2): **automatic** on acceptance, or **manual** "Create employee" by HR. The employee stays in **pre-boarding** status until the joining date (M01; UI brief: "offer → pre-boarding").
- `User.managerId` (exam app) becomes **derived** from the employee's current assignment, keeping one source of truth. Users without an employee keep a manual manager field for ATS use.

### 4.5a Person record across roles: `persons`, `person_roles` (J15)
One **person** record per human per tenant, with a role attached for every way that human appears in the tenant. The record lives **inside one tenant only** (`organization_id` + RLS, YX-ORG-14): it is never shared, matched or looked up across tenants, and there is no cross-company profile (G13 not adopted).

**`persons`**
- `organization_id`, names (first, middle, last, preferred), `primary_email`, `primary_phone`
- identity keys: `pan_hash` (keyed hash; unique per tenant), `uan` (unique per tenant), `aadhaar_ref` (masked reference only, last 4 + vault token, never the number; YX-SEC-08), `face_template_ref` (only while the person's consent is recorded, YX-SEC-28; deleted on withdrawal)
- `status` (active / merged / erased), `merged_into` (set on merge)

**`person_roles`**
- `person_id`, `role_type`: applicant / candidate, campus registrant, test-taker, employee (links the employment), alumnus, nominee, consultant, contract worker, vendor worker, external login
- `source_table` + `source_id` (e.g. `employments`, `candidates`, `contract_workers`, the consultant register, `users`), `start_on`, `end_on` (null = open)
- Every role table carries a non-null `person_id`; `employees.person_id` is unique (one employee record per person, all employments under it).

**`person_link_log`** (append-only): action (auto-link / proposed / confirmed / rejected / merge / unmerge), persons and roles involved, match basis (which key or score), decided by, reason, and the before-state needed to reverse it.

**Matching (YX-ORG-27):** on every new or imported role record. **Deterministic keys** (verified email, verified phone, PAN, UAN) auto-link to the existing person; if two keys point at different persons, nothing is linked and a proposal is raised. **Fuzzy** matches (name + DOB, or face match, the latter only where the person has consented) only **propose** a link in HR's "Possible same person" queue. **Name alone never links or merges.** Merge and unmerge are audited and reversible: unmerge restores each role, document and history row to its original person.

**Conversions keep history:** contract worker → employee, candidate → employee, alumnus → candidate (rehire) and consultant → employee each add a role to the **same person** and end the old one; the old role's records (deployments, site attendance, CLRA register rows, applications, test attempts, consultant invoices) stay intact and are shown on the person's timeline (M01 YX-LC-29 / 30, M13 YX-CLRA-14).

**Total-workforce view:** the people directory has a **Workforce** filter (employees, contract workers, consultants, vendor-worker placements) and P09 has a **total-workforce headcount** source that counts **distinct persons** with an open role of those types on the as-of date, by entity and location. **Billing:** P14 YX-BILL-02 counts one unit per distinct `persons` row per product per tenant per month.

### 4.6 Scoped settings — `settings`
- Columns: `scope_type` (tenant / legal_entity / pay_group / location / department / employment_type / grade / designation / employee), `scope_id`, `key` (registered, typed, with default), `value jsonb`, `valid_from` (optional: dated settings, e.g. leave year changes), `updated_by`.
- **Resolution:** the most specific scope wins (employee > designation > grade > employment_type > department > location > pay_group > entity > tenant > product default). An employee's designation, grade, employment type, department and location are read from the assignment in force on the as-of date; the pay group from M03 (entity × pay frequency × pay calendar).
- **Dated settings:** a registry entry may carry `dated: true`. Such a setting must be stored with `valid_from` and is always resolved **as of the period / date being processed**, never "today" (YX-ORG-18). Registered dated at launch: payroll settings (M03: day basis, protected net, regime cut-off…), leave-year and leave-policy options (M02), and statutory / legal options (P07). A payroll re-run, arrears computation or report for a past period reads the value that was in force then.
- **Example scoped setting:** `attendance.mode` (M02, gap D1): Punch / Assumed present / Timesheet, set per legal entity, location, department or employment type; in Punch mode a companion `attendance.missing_punch_effect` (block payroll approval, default / warning only) feeds P08 YX-LOCK-07/08. Both are `dated: true`.
- The screen always shows *where* a value comes from ("inherited from Workfox Pvt Ltd").
- Settings are registered in code per module, with type, allowed scopes and plain-language label. That feeds the settings search (UI brief §4) and prevents another 35-switch HR Settings (U90).
- **Starter templates (spec D17):** where HR policy varies between companies, a setting's product default ships as a starter template labelled "YukthiX starter — edit for your company"; the company sets its own value. Legally fixed values are not settings (P07).
- The ~70 existing `organizations` config columns stay until touched, then move to `settings` gradually (no big-bang rewrite).

---

## 5. Tenancy on Postgres (porting the exam-app pattern)

| # | Design |
|---|---|
| 1 | **Every** tenant-owned table has `organization_id NOT NULL`. That includes today's child tables (`attempts`, `answers`, `invitations`, `results`, `proctoring_events`). They are back-filled from their parent during the migration. |
| 2 | RLS enabled and **forced** on every tenant table. Policy: `organization_id = current_setting('app.current_org', true)::uuid`. Missing setting → no rows (fail-closed, same as today). **No super-admin bypass:** YukthiX staff get tenant data only inside a P02 YX-SEC-20 support session, where the support-session service sets `app.current_org` to the one approved tenant plus `app.support_session` (session id); restricted-area policies (P02 YX-SEC-10) deny rows whenever `app.support_session` is set. |
| 3 | `forTenant()` keeps its signature; inside the transaction it runs `SET LOCAL app.current_org / app.current_user / app.support_session / app.scope…`. `SET LOCAL` dies with the transaction, which removes today's pooled-connection reset concern. |
| 4 | The app connects as a **non-owner role** (RLS applies). Migrations run as the owner. A separate read-only role serves analytics (P09), also RLS-bound. |
| 5 | **Cross-tenant reference guard:** composite unique `(organization_id, id)` on parent tables and composite FKs `(organization_id, parent_id)` on children, so a row can never point to another tenant's row, even through a bug. |
| 6 | Indexes lead with `organization_id` for tenant-scoped lookups. |
| 7 | Background jobs (BullMQ) carry `organizationId` in the payload and always run through `forTenant`. Cross-tenant jobs (billing, retention sweeps) use an explicit, audited `withoutTenantScope`. |
| 8 | Entity / location / team visibility is **not** RLS tenancy. It is P02's record-visibility layer, applied on top (row filters + RLS "scope" setting where needed). |

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-ORG-01 | A tenant has at least one legal entity; exactly one is marked default. |
| YX-ORG-02 | A location belongs to exactly one legal entity; its state and timezone are mandatory. |
| YX-ORG-03 | Department parent chains cannot form cycles; moving a department moves its subtree. |
| YX-ORG-04 | A master record that is referenced (department, designation, grade, location, cost centre, type) can only be **archived**, not deleted. Archived masters can't be chosen for new assignments. |
| YX-ORG-15 | A structure master (department, designation, grade, employment type) is either **shared** (tenant-wide, optionally limited to listed entities) or **entity-only**. An assignment may only use masters available to its employment's legal entity. |
| YX-ORG-16 | Employee codes are unique per legal entity (default) or per tenant, by tenant setting. Switching from per-entity to per-tenant is allowed only when no duplicates would result; the screen lists clashes to fix first. Codes can be edited until the employee's first payroll is locked; afterwards only with a correction reason (audited). |
| YX-ORG-05 | Codes are unique within the record's scope (shared → tenant, entity-only → entity, YX-ORG-15; cost centres per legal entity); employee codes follow YX-ORG-16 (per entity or per tenant, customer choice). Codes are system-generated when blank. |
| YX-ORG-06 | An employee has at most one **open** employment per legal entity; and, unless the tenant allows concurrent employment (Q6), at most one open employment in the tenant. |
| YX-ORG-07 | Within an employment, assignments cover every day from `joined_on` to `exited_on` with **no gaps and no overlaps**. |
| YX-ORG-08 | An assignment's location and cost centres must belong to the employment's legal entity. |
| YX-ORG-09 | A manager must be an employee with an active employment on the assignment dates, in the same tenant. Reporting chains cannot form cycles. |
| YX-ORG-10 | Future-dated assignments are allowed (scheduled promotions and transfers). Past-dated changes follow P06 YX-HIS-12 tiered correction rights; changes reaching a **locked period** don't reopen it: arrears / recoveries post in the next payroll run (P06 Q4/Q5, P08 Q3). |
| YX-ORG-11 | Moving an employee to **another legal entity** closes the current employment and opens a new one (new employer for PF/ESI/TDS), linked as a transfer. The person, documents and history remain one employee (Q5). |
| YX-ORG-17 | An inter-entity transfer applies five **transfer policies**, defaulted from tenant/entity settings and changeable per transfer by HR: (1) leave balance: carry over / encash at old entity / lapse; (2) service continuity for gratuity, seniority and notice: continue from original joining date / restart; (3) employee code: keep / new in the target series; (4) settlement at the old entity: full F&F / none (amounts move over); (5) salary structure: keep / assign new. The chosen options are stored on the transfer record and shown in its impact preview before confirmation. |
| YX-ORG-12 | Settings resolve most-specific-scope-first; every setting shown in the UI states its source scope. |
| YX-ORG-13 | Every aggregate screen shows its scope (entity · location · period). The default scope is **all entities the user may see**, never a hidden default company (U1, U96). |
| YX-ORG-14 | Every tenant table has `organization_id NOT NULL` + forced RLS. A CI check fails the build if a new model lacks either. |
| YX-ORG-18 | Settings scopes are tenant, legal entity, pay group, location, department, employment type, grade, designation and employee; resolution order is employee > designation > grade > employment type > department > location > pay group > entity > tenant > product default, using the assignment in force on the as-of date. A setting registered `dated: true` must carry `valid_from` and is resolved as of the period or date being processed (payroll runs and re-runs, arrears, leave-year, protected net, statutory / legal options), never as of today. |
| YX-ORG-19 | Rehiring an ex-employee opens a **new employment on the existing employee record** (`rehire_of` = the previous employment). Five **rehire options**, defaulted from tenant/entity settings and changeable per rehire by HR, mirror YX-ORG-17: (1) service continuity for gratuity, seniority and notice: continue from original joining date / restart; (2) leave balance: restore the closing balance / start fresh; (3) gratuity service: add previous service / restart (subject to P07 rules and whether gratuity was paid at exit); (4) employee code: reuse previous / new in the series; (5) probation: again / waived. The options are stored on the employment and shown in an impact preview before confirmation. |
| YX-ORG-20 | Each employment-type category (permanent, probation, fixed-term, intern, apprentice, consultant, deployed contractor, retired re-employed) has a **statutory default matrix** (PF, ESI, PT, LWF, bonus, gratuity applicability) taken from P07; the company may override a default only where the law allows the choice. Fixed-term, intern and apprentice employments carry `contract_end_on`; extension or conversion to permanent is a dated P06 change. |
| YX-ORG-21 | A deputation / secondment / client-site posting is recorded on the assignment (host entity or client, host location, recharge flag) without changing the employing entity. While a host location is set, it drives the holiday calendar, PT state and geofence; statutory registrations (PF / ESI / TDS) stay with the employing entity; cross-entity recharge is exported for accounting when flagged. |
| YX-ORG-22 | **Bulk restructure:** merging or closing a legal entity (or location) runs a bulk transfer wizard that moves all open employments to the target entity, applying the YX-ORG-17 transfer options as defaults for the batch (changeable per person), with one impact preview and one approval; the closed entity is archived (YX-ORG-04) only when no open employment remains. |
| YX-ORG-26 | **One person across roles (J15).** Every role record in a tenant (candidate, campus registrant, test-taker, employee, alumnus, nominee, consultant, contract worker, vendor worker, external login) links to exactly one `persons` row of the **same tenant**; persons are never shared or matched across tenants. A conversion (contract worker → employee, candidate → employee, alumnus → candidate, consultant → employee) adds a role to the same person and ends the old role; the old role's records and history are kept unchanged. The total-workforce headcount and directory filter, and P14 billing (YX-BILL-02), count **distinct persons**. |
| YX-ORG-27 | **Person matching, merge and unmerge (J15).** Verified email, verified phone, PAN and UAN auto-link a new role to the existing person; conflicting deterministic keys, name + DOB similarity, or a face match (only with the person's recorded consent) raise a proposal that HR confirms or rejects; a name match alone never links or merges. Every link, merge and unmerge is written to `person_link_log` with basis, actor and reason, and is reversible: unmerge restores each role and its records to the original person. |
| YX-ORG-28 | **Names, addresses and phones (G3).** Person names are stored as parts (given, family, optional patronymic and grandfather's name) with a name order and an optional native-script legal name beside the Latin one; screens, letters and search (P17) use the locale's display format and match both scripts. Addresses are structured: ISO 3166-1 country, ISO 3166-2 subdivision, and the required lines and postal-code pattern of that country's template (P07 pack data). Phones are validated and stored in E.164 and shown in national format. Statutory files use the name and address form the receiver requires. |
| YX-ORG-29 | **Gender list (R7).** Gender is chosen from a tenant-editable list whose starter values are female, male, transgender, non-binary and prefer not to say; each value maps to the categories each statutory report needs (e.g. India Board's report headcount by female / male / transgender, R7). The employee self-declares through a P02 §4.5 change; the field is Personal class and headcount by gender follows small-group suppression (YX-SEC-14). |
| YX-ORG-30 | **Region catalogue (G9 + S16).** Every tenant has a home region and every legal entity a `data_region` from the platform region catalogue (IN, ME-AE, ME-SA, EU, US, SG; P21 §3); the region must be live and serve the entity's country, and the country's gate must be green (YX-GLB-01). The data region is fixed at creation and changes only through a region move (P21 YX-GLB-11). Residency and privacy rules: P02 YX-SEC-37 / 38. |

---

## 7. Flows & events

| Operation | Emits (for P04 notifications, P09 metrics) |
|---|---|
| Create / archive entity, location, department… | `org.master.changed` |
| Hire (from offer or manual) → employee + employment + first assignment | `employee.hired` |
| Scheduled assignment change becomes effective (daily job) | `employee.change.effective` (P06; the old `employee.assignment.effective` key is retired, APX-B §1) |
| Transfer to another entity | `employment.closed` + `employment.opened` (linked) |
| Entity merge / close (bulk transfer, YX-ORG-22) | `employment.closed` + `employment.opened` per person, plus `org.restructure.completed` |
| Exit (last working day) | `employment.exited` |

**Tenant set-up wizard** (extends the exam app's first-run `setup`):
1. Company details.
2. Legal entity/entities with statutory IDs.
3. Locations (state, timezone, holiday calendar).
4. Departments (template or import).
5. Designations & grades.
6. Import employees (CSV/Excel with validation preview; spec §2.1.11).

The wizard shows a completeness checklist (UI brief principle 4).

**Setup hub (G1):** this wizard and the M03 payroll setup wizard are now two cards (C01 Organisation, C11 Payroll) of **one setup hub** with a completeness card per module, starter templates applied at setup with "review before go-live" flags, a go-live readiness model (blocking / advisory checks, score, owner sign-off) and the full admin editor inventory: see [APX-E](APX-E-setup-admin.md) (rules YX-ORG-23–25).

---

## 8. UI (from the UI brief)
- **Org set-up:** T3 record workspace per master, T2 lists, and a tree view for departments and cost centres. Location page with map + radius (M02; Frappe ref 02 §1.7).
- **Entity + period switcher** in the app shell (T1), defaulting to all permitted entities (YX-ORG-13).
- **Settings:** module-level pages with inherited-value badges ("from Workfox Pvt Ltd") and override/reset per scope.
- **Employee workspace:** assignment timeline (P06), with a "Change" action that previews the impact (M01; Frappe ref 05 §1.3).

---

## 9. Migration & rollout (exam app → YukthiX platform)

1. **During the Postgres migration (D10):** port RLS as in §5; add `organization_id` + RLS to the 5 child tables; add the CI check (YX-ORG-14).
2. Add the new tables (§4). Every existing organization gets one default legal entity and one default location, created from its name/region.
3. Map `Job.department` free text → `departments` (distinct names), keeping the text column until the ATS switches over.
4. Add `settings` and move config columns only as their features are touched.
5. `User.managerId`: keep for staff without an employee; derive for employees.

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Tenant key name: keep the exam app's `organization_id` everywhere, or rename to `tenant_id` (D3 wording)? | **Keep `organization_id`.** Renaming 93 models adds risk for no user benefit; "tenant" stays the concept name in docs. |
| Q2 | Multiple legal entities per tenant: available on all plans, or only higher plans? | All plans (common in Indian SMB groups); price by employee count, not entities. |
| Q3 | Departments / designations / grades: tenant-wide, or separate per legal entity? | **Tenant-wide** with an optional "applies to entities" filter. Groups want one structure. |
| Q4 | Employee code: unique per legal entity or per tenant; customer format? | Per legal entity, with a configurable pattern (prefix + number); import keeps existing codes. |
| Q5 | Transfer between legal entities: same employee with a new employment (recommended), or a new employee record (as Frappe offers)? | **Same employee, new employment**: one person and one history, while PF/ESI/TDS stay correct per employer. |
| Q6 | Allow concurrent employments (one person working for two entities at once)? | No at launch (setting off); design allows it later. |
| Q7 | Business units / divisions above departments? | Not a separate level: model as top-level departments. Revisit with customers. |
| Q8 | Cost centre split (one employee across several cost centres by %)? | Support splits in the data model (percent rows); UI in wave 3 with payroll accounting export. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Keep `organization_id`** as the tenant key column on every table; "tenant" remains the concept name in docs. | 24 Sep 2026 |
| Q2 | **Multiple legal entities on all plans**; pricing is by employee count, not by number of entities. | 24 Sep 2026 |
| Q3 | **Both.** Each department / designation / grade / employment type is either **shared** (default; optionally limited to some entities) or **entity-only**. Mixed trees are allowed (entity-only child under a shared parent). Rule YX-ORG-15. | 24 Sep 2026 |
| Q4 | **Customer's choice (C):** employee codes unique per legal entity (default) or per tenant; configurable pattern per entity or tenant; imports keep existing codes. Switching mode is blocked while duplicates would result. Rule YX-ORG-16. | 24 Sep 2026 |
| Q5 | **Same employee, new employment** for inter-entity transfers (one person, one profile, documents and history; payroll/PF/ESI/Form 16 per employment). Company policy is handled by **five transfer options** (leave, service continuity, code, F&F, salary structure) set as company defaults and changeable per transfer. Rules YX-ORG-11, YX-ORG-17. | 24 Sep 2026 |
| Q6 | **No concurrent employments at launch** (one open employment per person, YX-ORG-06). The data model already allows several; a future tenant setting will switch it on when payroll, attendance and statutory support split employment. | 24 Sep 2026 |
| Q7 | **No separate business-unit level.** Divisions are top-level departments in the (any-depth) department tree; reports, approvals and visibility work on "department and its subtree". A department may be flagged `is_division` for labelling only. | 24 Sep 2026 |
| Q8 | **Cost-centre splits in the data model now** (`assignment_cost_centres`, percentages total 100 %, default one row at 100 %); the split UI ships in wave 3 with payroll's accounting export. | 24 Sep 2026 |
| D1 | **Attendance mode is a scoped setting.** `attendance.mode` (Punch / Assumed present / Timesheet) is set per legal entity, location, department or employment type; in Punch mode `attendance.missing_punch_effect` chooses block payroll approval (default) or warning only (M02, P08). Both are dated settings. | 26 Sep 2026 |
| D3 | **Rehire continuity options.** An ex-employee rehire is a new employment on the existing employee record (`rehire_of`); the company picks what continues (service, leave balance, gratuity service, employee code, probation) as defaults, changeable per rehire, like the YX-ORG-17 transfer options. Rule YX-ORG-19. | 26 Sep 2026 |
| D8 | **Consistency fix:** settings scopes extended with `pay_group`, `employment_type` and `designation` (precedence employee > designation > grade > employment type > department > location > pay group > entity > tenant); registry flag `dated: true` makes a setting effective-dated and resolved as of the period processed. Rule YX-ORG-18. | 26 Sep 2026 |
| E6 | **Fixed-term, intern, apprentice and statutory default matrix.** `employments.contract_end_on` for fixed-term, intern and apprentice employments (extension / conversion via P06 changes). Employment-type categories are permanent, probation, fixed-term, intern, apprentice, consultant, deployed contractor and retired re-employed; each carries a statutory default matrix (PF / ESI / PT / LWF / bonus / gratuity) from P07, overridable by the company only where the law allows. Rule YX-ORG-20. | 26 Sep 2026 |
| E8 | **Host postings and bulk restructure.** Deputation / secondment / client-site posting is held on the assignment (host entity or client, host location driving holiday calendar, PT state and geofence, cross-entity recharge flag); the employer does not change. Entity merge / close runs a bulk transfer applying the YX-ORG-17 options as batch defaults. Rules YX-ORG-21, YX-ORG-22. | 26 Sep 2026 |
| D17 | **Starter templates, not hard-coded policy** (spec D17): policy settings ship with a starter value labelled "YukthiX starter — edit for your company"; each company sets its own; legal rules stay enforced by P07 (§4.6). | 26 Sep 2026 |
| G1 (consistency fix) | **One setup hub replaces the disconnected P01 org wizard and M03 payroll wizard** (GAP-REGISTER G1): 22 completeness cards (organisation, roles, privacy notice, approvals, notification channels incl. WhatsApp / SMS-DLT / email-domain checklists, documents, leave, time, kiosks, mobile roll-out, payroll, lifecycle, expenses, performance, learning, helpdesk, IC constitution, Engage, hiring, proctoring, integrations, billing) with required / optional steps and dependencies; starter templates applied at setup with ⚑ review-before-go-live flags; go-live readiness checks (blocking / advisory), score and owner sign-off per module × entity, feeding the future P15 playbook; admin editor inventory for every configurable item (G2–G5); roster ownership (G6). [APX-E](APX-E-setup-admin.md), rules YX-ORG-23 (setup hub & starter review), YX-ORG-24 (readiness & sign-off), YX-ORG-25 (every company policy has a registered editor). | 26 Sep 2026 |
| F-follow-ups (consistency fix) | **One key for dated changes:** a scheduled assignment change taking effect emits P06's `employee.change.effective`; `employee.assignment.effective` is retired and not emitted (APX-B §1, §3 #6). Meaning unchanged. | 26 Sep 2026 |
| Validation pass 3 Must (J15), founder decision 28 Sep 2026 | **One `persons` record per tenant with role attachments (J15, with J8, J14, T6).** `persons` (names, primary email / phone, PAN hash, UAN, masked Aadhaar ref, consented face-template ref, status) and `person_roles` (applicant / candidate, campus registrant, test-taker, employee, alumnus, nominee, consultant, contract worker, vendor worker, external login; source table + id; start / end), inside one tenant only (no cross-company profile, G13). Deterministic keys (email, phone, PAN, UAN) auto-link; name + DOB or consented face match proposes a link for HR; never on name alone; merge / unmerge audited and reversible. Conversions keep history. Total-workforce view and P14 billing count distinct persons. §4.4, §4.5, §4.5a, YX-ORG-26 / 27. | 28 Sep 2026 |
| Validation pass 3 Should (G3 + R7), founder decision 28 Sep 2026 | **Structured names, addresses, phones and an inclusive gender list.** Name parts (given / family / patronymic / grandfather), name order, native-script legal name; ISO 3166 structured addresses with country templates; E.164 phones; gender list starter female / male / transgender / non-binary / prefer not to say, mapped to statutory report categories (needed for the Board's report, R7). §4.1, §4.2, §4.4; YX-ORG-28 / 29; [P21](P21-global-readiness.md). | 28 Sep 2026 |
| Validation pass 3 Should (G9 + S16), founder decision 28 Sep 2026 | **Region catalogue.** Home region per tenant and `data_region` per legal entity from the platform catalogue (IN, ME-AE, ME-SA, EU, US, SG); existing tenants map to IN; changes only via region move. YX-ORG-30; P21 YX-GLB-10 / 11; P02 YX-SEC-37 / 38. | 28 Sep 2026 |
