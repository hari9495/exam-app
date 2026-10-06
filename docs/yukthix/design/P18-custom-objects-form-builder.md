# P18 · Custom Objects, Form & Page-Layout Builder

> **Status:** ✅ Decided (by principle), 26 Sep 2026. The 4 questions (§10) were decided by spec principles D17 / D18 and the user decision of 26 Sep 2026 (B20 designed now, built in **wave 6**; recommended options adopted); see §11.
> **Covers:** spec §2.1.5 (Custom Fields & Form Builder: "tenant-defined fields on any entity"), GAP-REGISTER **B20** (custom objects & form / page-layout builder; Bench 39), and pieces (2) custom objects and (3) page-layout builder of P11 **TR1**.
> **Stays in TR1 (team review, not designed here):** (1) the public **component SDK** (custom UI components built on `packages/ui`, D16) and (4) the **partner app marketplace**. Branded portals (5) already exist as T9 seeds.
>
> **Builds on:**
> - P01 custom fields on core entities (§4, YX-ORG-16 area), settings registry and scopes;
> - P02 roles, scopes and field classes (every custom field has a class);
> - P03 request-type registry (custom request types run on the same engine);
> - P05 documents (file fields) and templates (merge fields);
> - P06 effective dating (optional dated custom fields);
> - P08 audit;
> - P09 metric layer and report builder;
> - P11 API-first: REST + GraphQL, webhooks, OpenAPI generation (YX-API-01–15);
> - P15 import framework and sandbox promotion (YX-MIG-10);
> - P17 global search (custom objects are a search source).
>
> **Build wave:** **wave 6.** Custom *fields* on core entities (P01) remain wave 1; P18 adds objects, layouts and builders on top.

---

## 1. Purpose & scope
Let a company model the things YukthiX doesn't ship, and shape the screens it does ship, **without code and without YukthiX customisation work**:
1. **Custom objects:** company-defined record types (e.g. "Uniform issue", "Vehicle", "Canteen card", "Site induction", "Union membership") with fields, lookups to core entities, validation, sensitivity per field and record-level access.
2. **Automatic APIs and webhooks** for every custom object (P11), so integrations treat them like core entities.
3. **Custom forms and page layouts per role** for core and custom records: drag-and-drop sections, field order, conditional visibility, required rules.
4. **Custom request types** on the P03 engine (approval chains, SLA, cards, mobile).
5. **Custom reports and metrics** on the P09 layer.
6. **Import / export** (P15), **versioning** and **sandbox promotion** (YX-MIG-10).

**Out of scope:**
- Custom UI components (component SDK, TR1). Custom code is allowed only as the P22 sandboxed script step (amended 28 Sep 2026, §8b).
- A marketplace of partner apps (TR1).
- Changing core behaviour: custom objects never alter payroll, statutory, leave-ledger or other governed calculations (a custom field may be *read* by a formula only where the owning doc allows it, e.g. M03 components reading an approved custom input).

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | P18 |
|---|---|---|
| Custom fields | Designed in P01 (employee record custom fields: type, section, sensitivity, self-edit; Settings 1.5) | **Generalise**: same field engine for core entities and custom objects |
| Form rendering | ui-v2 form components; schema-driven forms in the exam app's test builder | **Reuse** as the layout renderer (`packages/ui`, D16) |
| API | P11 OpenAPI generation, REST + GraphQL over one service layer | **Extend**: generated routes per custom object |
| Request types | P03 registered request types (code) | **Extend**: tenant-defined request types from metadata |
| Custom objects, layout builder | None | **New** |

## 3. Concepts

| Term | Meaning |
|---|---|
| **Custom object** | A tenant-defined record type: API name (`x_vehicle`), labels (singular / plural, per language), icon, owner module (the menu it appears under), record name pattern, record scope model, status. |
| **Custom field** | A field on a core entity or custom object: type, label, help, **P02 class**, required rule, validation, default, dated (P06) yes / no, self-editable yes / no. |
| **Field types** | text, long text, number, currency (INR by default, P01 currency), percent, date, date-time, yes / no, pick-list (single / multi, with starter values), email, phone (E.164), URL, file (P05 document type), **lookup** (to a core entity: employee, legal entity, location, department, designation, grade, cost centre, candidate, job, asset, project (M12), vendor (M13) — or to another custom object), formula (read-only, over fields of the same record and its lookups), auto-number, geo-point. |
| **Record scope model** | How P02 decides who sees a record: **by linked employee** (scope follows the employee lookup, e.g. a vehicle assigned to an employee is visible to their manager / HR in scope), **by org unit** (entity / location / department lookup), **by owner** (creator and their manager), or **restricted** (named members only, like a case; YX-SEC-10 behaviour). |
| **Layout** | For one record type × role (× optional entity): sections, field order, columns, read-only / hidden / required overrides, conditional rules, related lists (child records). |
| **Conditional rule** | Show / hide / require a field or section when a condition on the record holds ("show *Licence number* when *Vehicle type* = Two-wheeler"). |
| **Custom request type** | A P03 request type defined in metadata: subject (employee), form (a layout), approval policy, SLA, effect on approval (create / update a custom-object record, or notify only). |
| **Package version** | An immutable snapshot of a tenant's custom metadata (objects, fields, layouts, request types, reports), used for promotion from sandbox and rollback. |

## 4. Design

### 4.1 Object builder
- **Create:** start blank or from a **labelled YukthiX starter** ("Vehicle register", "Uniform & PPE issue", "Canteen / transport pass", "Union membership", "Site induction", "Visitor pass" if the tenant does not use the M02 visitor module) — each "YukthiX starter — edit for your company" (D17).
- **Fields:** add, reorder, set class (default **Internal**; Personal / Confidential / Special available; the builder warns when a label looks sensitive — "health", "Aadhaar", "caste", "religion", "disability" — and requires Special for recognised categories).
- **Validation:** required, unique (per tenant or per entity), min / max, regex with a tested example, cross-field ("end date ≥ start date"), lookup filters ("only active employees in the same entity").
- **Relationships:** lookups (many-to-one) to core entities or other custom objects; child objects (master–detail, delete cascades to children with a preview); many-to-many via a junction custom object.
- **Record scope** chosen at creation (§3); changing it later re-evaluates visibility and re-indexes search (P17 YX-SRCH-06).
- **Lifecycle:** draft → active → archived. Deleting an object with records requires export first and a typed confirmation (APX-D §6.4); data is retained for the audit period.
- **Placement:** the object appears as a menu item under its owner module (counts against the ≤ 8 items rule; beyond that it goes under the module's "More" entry) or under a tenant **Custom** module.

### 4.2 Automatic APIs & webhooks (P11)
- Every active object gets REST routes (`/v1/custom/{api_name}` list / get / create / update / delete, with cursor pagination, filters on indexed fields and sparse fieldsets) and GraphQL types, **generated from metadata into the tenant's OpenAPI document** (per-tenant spec extension on the developer portal).
- Same rules as core routes: tenant RLS, P02 scope and field classes, idempotency, rate limits, problem-details errors, audit (YX-API-03–11).
- Events `custom.{api_name}.created / updated / deleted` in the event catalogue (APX-B) with the record's sensitivity; webhook payloads for objects with Confidential / Special fields carry IDs and change type only (YX-API-10).
- API names are immutable once active (renaming the label is free); a breaking field change (delete, type change) follows the P11 deprecation policy for keys that used the field in the last 90 days.

### 4.3 Form & page-layout builder
- **Drag-and-drop canvas** (T3 record workspace preview): sections (one or two columns), tabs, field palette, related lists, a help text block; live preview **as a chosen role** and **as a sample record**.
- **Per role (and optionally per legal entity):** a layout is assigned to roles; a person with several roles gets the first matching layout by priority. Default layout for everyone else.
- **Core records:** the company may re-order and hide *optional* fields and add custom fields to core layouts (employee workspace tabs, request sheets, candidate record, ticket form). It **cannot** hide fields a rule requires (statutory IDs where the law needs them, P07; fields a YX rule marks mandatory), cannot change a field's P02 class downwards, and cannot remove the locked system sections (audit timeline, approval trail).
- **Conditional rules** with a small condition builder (field, operator, value; AND / OR); evaluated on the server too, so hidden-but-required contradictions are rejected at save.
- **Mobile:** layouts render on the T8 request sheet and record view; the builder shows a mobile preview; fields marked "desk only" are skipped on mobile.
- **Hiding is not security.** A layout never grants or removes access; field classes and scopes decide (P02). Hidden fields are still protected server-side, and a field hidden in the layout but readable by the role stays readable via the API.

### 4.4 Custom request types (P03)
- Built in the request-type builder: name, subject (self / on behalf, YX-WF-18), form layout, approval policy (P03 editor, starter chain "manager → HR"), SLA, attachments, mobile yes / no, risk level (bulk approve allowed only for "low").
- **Effect on approval:** create a custom-object record, update fields on one (including a lookup to an employee), or notify only. Custom request types **cannot** write to core payroll, leave, attendance or statutory data; where a company needs a payroll input, the effect is "create an M03 one-time pay input for review" through the owning module's API, which keeps its own validation.
- Appear in the request sheet type picker, the approvals inbox, the P17 palette ("> new uniform request") and P04 notifications (a generic template family with the company's wording).

### 4.5 Custom reports & metrics (P09)
- Custom objects are **base entities** in the report builder with their lookups as joins; field classes and scopes are enforced as for core entities (YX-MET-03).
- Companies define **calculated metrics** over custom objects (count, sum, average of number / currency fields, by any lookup dimension) through the P09 formula builder; they inherit the most restrictive class of their inputs (YX-MET-11) and small-group suppression applies (YX-MET-04).
- Custom-object measures can be placed on custom dashboards (P09 §4.4) and scheduled (P09 §4.6).

### 4.6 Import / export, versioning & sandbox (P15)
- **Import:** each object gets a P15 import template automatically (columns = fields, lookups by code or email), with validate, preview and rollback like any P15 import; history import allowed.
- **Export:** CSV / XLSX from lists and the report builder; included in the whole-tenant export (YX-TEN-05) with the metadata as JSON.
- **Versioning:** every metadata change is recorded; **package versions** are cut on demand or on each promotion; diff between versions; rollback of metadata (data kept; removed fields are archived, not dropped, for the audit period).
- **Sandbox promotion:** metadata is built in the tenant sandbox and moved to production only through a reviewed **promotion** (diff + approver, P03; YX-MIG-10). Production editing of layouts and pick-list values is allowed for users with `customisation.manage`; new objects and field-type changes go through promotion when the company switches on "promotion required" (starter setting: on for objects, off for layouts).

### 4.7 Limits and pricing (D18)
- **Included in the price** (D18: every built feature included): objects, fields, layouts, request types, reports, APIs and webhooks.
- **Fair-use limits per tenant** (team sets exact numbers; starter proposal): 50 custom objects, 200 fields per object, 25 layouts per record type, 50 custom request types, records up to 20 × the billable-employee count. Shown on the usage page (YX-BILL-07) with 80 % / 100 % alerts.
- **Beyond fair use:** extra records and file fields count towards **storage**, charged as the **storage add-on**; API calls follow the API-limits add-on (P11 Q8). **Customisation work** YukthiX staff do for one company (building their objects or layouts for them) is the customisation add-on (D18 item 5).

## 5. Data model

| Table | Key columns | Notes |
|---|---|---|
| `custom_objects` | `organization_id`, `api_name`, `labels jsonb` (per locale), `icon`, `owner_module`, `scope_model` (employee / org_unit / owner / restricted), `name_pattern`, `status`, `starter_key?`, `version` | Unique (`organization_id`, `api_name`) |
| `custom_fields` | `organization_id`, `object_ref` (core entity key or custom object id), `api_name`, `type`, `labels jsonb`, `help jsonb`, `field_class` (Public / Internal / Personal / Confidential / Special), `required`, `unique_scope`, `validation jsonb`, `default jsonb`, `lookup_target`, `lookup_filter jsonb`, `formula`, `dated`, `self_editable`, `status` | Generalises P01 custom fields |
| `custom_records` | `organization_id`, `object_id`, `id`, `name`, `values jsonb`, `employee_id?`, `legal_entity_id?`, `location_id?`, `department_id?`, `owner_id`, `member_ids uuid[]` (restricted), `status`, audit columns | Scope keys as real columns for RLS / P02 predicates; generated expression indexes for fields marked "indexed" (max 10 per object); partitioned by object for large tenants |
| `custom_record_history` | `record_id`, `field`, `value`, `valid_from`, `valid_to` | Only for `dated` fields (P06) |
| `layouts` | `organization_id`, `record_type`, `name`, `roles uuid[]`, `legal_entity_id?`, `priority`, `definition jsonb` (sections, fields, related lists), `rules jsonb` (conditional), `channel` (desk / mobile / both), `version` | Validated against locked sections and required fields on save |
| `custom_request_types` | `organization_id`, `key`, `labels jsonb`, `layout_id`, `approval_policy_id` (P03), `effect jsonb`, `risk_level`, `mobile`, `status` | Registered into the P03 registry at activation |
| `customisation_packages` | `organization_id`, `version`, `source` (sandbox / production), `manifest jsonb`, `diff_from`, `promoted_by`, `approved_by`, `promoted_at` | Immutable |

Special-class values in `values jsonb` are stored encrypted with the tenant data key (P12 envelope encryption), like core Special fields.

## 6. Rules

| ID | Rule |
|---|---|
| YX-CUST-01 | Every custom field has exactly one P02 field class; reads, writes, API, exports, reports, search and AI apply it exactly as for core fields. Fields whose label or pick-list matches a recognised special category (health, disability, biometrics, religion, caste, Aadhaar, sexual orientation) must be Special. |
| YX-CUST-02 | Every custom object declares a record scope model (linked employee / org unit / owner / restricted); P02 visibility is computed from it server-side; restricted objects behave like cases (members only; "not found" for others, YX-SEC-10). |
| YX-CUST-03 | Every active custom object is automatically exposed through the public REST and GraphQL API, documented in the tenant's generated OpenAPI, and emits `custom.<api_name>.created / updated / deleted` events, with all P11 rules (RLS, scopes, field classes, idempotency, rate limits, audit, ID-only webhooks for Confidential / Special) applied. |
| YX-CUST-04 | A layout controls presentation only: it never grants or removes access, cannot hide or un-require a field a YX rule or the law requires, cannot remove locked system sections (audit, approval trail), and conditional rules are enforced on the server as well as the client. |
| YX-CUST-05 | Custom request types run on the P03 engine with the same approval, delegation, proxy, SLA, self-approval and audit rules as built-in types; their effects are limited to custom-object records, notifications, or submitting an input to a module's own API for that module's validation; they never write governed payroll, leave, attendance or statutory data directly. |
| YX-CUST-06 | Custom objects are base entities in the P09 report builder and metric layer; custom calculated metrics inherit the most restrictive class of their inputs and obey small-group suppression (YX-MET-04, YX-MET-11). |
| YX-CUST-07 | Metadata changes are versioned and diffable; destructive changes (delete object / field, type change) require an export offer, a typed confirmation and keep data archived for the audit period; API names are immutable once active. |
| YX-CUST-08 | When "promotion required" is on, new or changed objects, fields and request types reach production only through a reviewed sandbox promotion (YX-MIG-10); every production metadata edit is audited with before / after (P08). |
| YX-CUST-09 | Fair-use limits per tenant (objects, fields, layouts, request types, records) are shown on the usage page with 80 % / 100 % alerts (YX-BILL-07); exceeding them never blocks reading or exporting existing data; storage beyond fair use is the storage add-on (D18). |
| YX-CUST-10 | Starter objects, layouts and request types are labelled "YukthiX starter — edit for your company" and are never updated in a tenant automatically; new starter versions are offered as a diff (D17). |
| YX-CUST-11 | Custom fields may be used in any company rule through the P19 rule engine (policy values, eligibility, validation, routing, automations, company pay components). They never change statutory calculations, protected areas or locked periods (P19 YX-RULE-03 / 04 / 08). *(Amended 26 Sep 2026 by D19; previously core modules read custom fields only where their own doc allowed.)* |

## 7. Flows / APIs & UI

**Flows.**
1. **Build an object:** Settings › Customisation › Objects → New (blank / starter) → fields → scope model → layout → activate (sandbox) → promote (if required) → menu item appears for permitted roles.
2. **Build a request type:** Settings › Customisation › Request types → layout → approval policy (P03 editor) → effect → activate → appears in the request sheet and palette.
3. **Change a core layout:** pick record type → clone default → drag / hide / add custom fields → assign roles → preview as role → save (validated against locked fields).
4. **Promote:** sandbox → package version → diff → approver (P03) → apply to production → audit.

**APIs.** `/v1/custom/{api_name}` (CRUD, generated); `/v1/metadata/objects`, `/fields`, `/layouts`, `/request-types`, `/packages` (read for integrators; write with `customisation.manage`, audited).

**Events emitted.** `custom.<api_name>.created / updated / deleted`, `customisation.package.promoted`, `customisation.object.activated / archived`.

**UI** (brief templates; APX-D screens PLT-22 – PLT-25).
- **Object builder** (T3): fields grid, field sheet (type, class with sensitive-label warning, validation with a test value), relationships diagram, scope model, starter picker.
- **Layout builder** (T3 canvas): field palette, sections, conditional-rule builder, role / entity assignment, desk and mobile preview "as role".
- **Request-type builder** (T5 wizard): layout → policy → effect → review.
- **Packages & promotion** (T2): versions, diff viewer, promote with approval.
- **Custom object list / record** (T2 / T3): generated from metadata with the standard list filters, bulk import / export, related lists and activity timeline.

**Settings pages owned** (APX-D §3): new page **1.7 Customisation** (objects, fields, layouts, request types, packages, starter library, limits used); P01 page 1.5 Employee records keeps core custom fields and links here.

## 8. Migration & rollout
- Wave 1 (already designed): P01 custom fields on core entities.
- **Wave 6:** field engine generalised to custom objects; object builder, generated APIs / events, layout builder for custom objects and core records, custom request types, report-builder support, P15 import templates, packages and promotion, limits on the usage page.
- Existing P01 custom fields are migrated in place into `custom_fields` (same ids, `object_ref` = core entity), with no change to their data or class.
- TR1 pieces (component SDK, marketplace) are decided by the team; if approved, they build on P18 metadata and the P11 OAuth review.

## 8b. P22 cross-reference (28 Sep 2026)
- **Amends §1 "Custom code … excluded":** scripts are now allowed **only** as the [P22](P22-workflow-studio-ai-assistant.md) sandboxed **script step** inside a workflow (wave 6): JS / TS with the P11 SDK sandbox-safe subset, isolated, service identity never broader than the publishing admin, vault secrets, static checks, versioned and reviewed (YX-WFS-13–15).
- Server functions outside workflows, custom UI components and the component SDK remain in **P11 TR1** (team review).
- Workflows can create and update custom-object records and custom fields (never governed fields), and P18 forms can trigger a workflow.

## 9. Acceptance tests (samples)
- A "Vehicle" object with a Confidential field *Insurance premium* and scope "linked employee": the employee's manager sees the vehicle but not the premium; the premium is redacted in the API and export for the manager's key (YX-CUST-01/02/03).
- Creating a field labelled "Disability details" as Internal is refused with "must be Special" (YX-CUST-01).
- A restricted "Union grievance log" object: a non-member HR admin gets "not found" in the list, search and API (YX-CUST-02, YX-SRCH-05).
- A layout that hides PAN on the employee workspace for HR is rejected (PAN required by law for payroll, YX-CUST-04); hiding *Blood group* works, and the API still returns it to roles that can read it.
- A "Uniform request" approved by the manager creates a Uniform-issue record; a custom request type configured to write a leave balance cannot be saved (YX-CUST-05).
- A report "Vehicles by location" with a sum of premiums shows "suppressed" for a location with 2 vehicles to a department head (YX-CUST-06).
- Deleting a field used by an API key in the last 30 days shows a deprecation warning and requires a typed confirmation; the values remain archived (YX-CUST-07).
- With "promotion required" on, creating an object directly in production is blocked with a link to the sandbox (YX-CUST-08).
- A tenant at 100 % of the object limit can still read and export all records (YX-CUST-09).

## 10. Open questions (decided by principle, §11)

| # | Question | Recommendation |
|---|---|---|
| Q1 | How far can companies change core screens? | **Re-order, hide optional fields, add custom fields, role-based layouts and conditional rules on core records**; never hide legally or rule-required fields, lower a field class or remove audit / approval sections (YX-CUST-04). Custom code and components stay in TR1. |
| Q2 | Can custom request types affect core data? | **No direct writes to governed data**; effects are custom records, notifications, or an input submitted to the owning module's API for its own validation (YX-CUST-05). Keeps payroll and statutory results trustworthy (D17: law and governed calculations enforced). |
| Q3 | Production editing vs sandbox promotion | **Company choice** with a labelled starter: promotion required for objects, fields and request types; layouts and pick-list values editable in production by `customisation.manage`; all edits audited (YX-CUST-08, D17). |
| Q4 | Limits and pricing | **All builder features included in the price** (D18); **fair-use limits per tenant** set by the team (starter proposal §4.7); records / files beyond fair use count towards the **storage add-on**; API calls follow the API-limits add-on; YukthiX building objects for a company is the customisation add-on. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** role-based layouts with re-order, hide-optional, custom fields and conditional rules on core and custom records; legally / rule-required fields, field classes and locked system sections can't be weakened (YX-CUST-04); custom code and UI components remain in P11 TR1. | 26 Sep 2026 |
| Q2 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** custom request types run on P03 and may create / update custom records, notify, or submit an input to a module API; never write governed payroll, leave, attendance or statutory data directly (YX-CUST-05, YX-CUST-11). | 26 Sep 2026 |
| Q3 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** "promotion required" is a company setting with a labelled starter (on for objects / fields / request types, off for layouts and pick-list values); every metadata change versioned and audited; promotion via YX-MIG-10 (YX-CUST-07/08). | 26 Sep 2026 |
| Q4 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** every builder feature included in the $1 price; fair-use limits per tenant (team sets numbers; starter proposal §4.7); storage beyond fair use = storage add-on; higher API limits = API-limits add-on; customisation work for one company = customisation add-on (YX-CUST-09). | 26 Sep 2026 |
| B20 | **Gap-register extension (user decision 26 Sep 2026): custom objects & form / page-layout builder** (GAP B20, spec §2.1.5) designed as P18 — custom objects with typed fields, lookups, validation, P02 class per field and record scope models; generated REST / GraphQL / webhooks; role-based layouts with conditional fields; custom request types on P03; custom reports / metrics on P09; P15 import / export; versioned packages and sandbox promotion; fair-use limits. Rules YX-CUST-01–11. **Designed now, built in wave 6.** The **component SDK and partner marketplace stay in P11 TR1** for team review. | 26 Sep 2026 |
| D19 | **Amended by spec D19 / P19 (26 Sep 2026):** layout conditions and validations now use the shared P19 rule language; custom fields are usable in every company rule; YX-CUST-11 rewritten accordingly. | 26 Sep 2026 |
| P22 | **Amends §1 (founder decision 28 Sep 2026):** custom code allowed only as the P22 sandboxed script step (wave 6, YX-WFS-13–15); custom UI components / component SDK stay in P11 TR1. | 28 Sep 2026 |
