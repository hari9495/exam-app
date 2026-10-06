# P19 · Policy Rule Builder

> **Status:** ✅ Decided (6/6), 26 Sep 2026. Q4–Q6 are decided by principle (D17 / D18 / P06).
> **Covers:** spec decision **D19** (every company rule is editable and can use any field, including custom fields).
> **One shared rule language** and builder for the whole product:
> - policy conditions and values in every module;
> - validation rules on any record;
> - automations ("when … then …");
> - a test mode that shows who a change affects.
>
> **Replaces the separate condition syntaxes** in P03 (approval conditions), P18 (layout conditions) and P09 (formula builder); they become uses of P19.
>
> Competitors: Salesforce (validation rules, Flow), Workday (business process conditions, calculated fields), Darwinbox / Keka (policy engines), Zoho People (custom rules, workflows).
>
> **Builds on:**
> - P01 scoped settings;
> - P02 roles and field classes;
> - P03 workflow engine;
> - P06 effective dating and retro;
> - P07 statutory rules as data;
> - P08 locks and audit;
> - P09 metrics;
> - P11 API and webhooks;
> - P15 sandbox and promotion;
> - P18 custom fields and objects;
> - every module that has policies (M01–M13, T01–T08).
>
> **Pricing (D18):** included. Fair-use limits on rule count and automation runs, with usage beyond them as an add-on.
> **Build:** the engine and builder in wave 1 (P03 approvals and P18 conditions depend on it). Module policies adopt it as each module ships. Automations follow in wave 2.

---

## 1. Purpose & scope
Every company runs HR differently:
- some follow only what the law requires;
- others have their own policies on top;
- many have different rules per site, grade or employee type.

P19 lets a company express **any of its own rules** using **any field**: built-in or custom, on any record, and on related records (employee → position → location → entity). It does this without code, safely, and with a preview of the effect before it goes live.

**Three layers, always** (D19):

| Layer | Owner | What the company can do |
|---|---|---|
| **Law** (P07 statutory rules) | YukthiX keeps it current | Choose legal options and applicability per entity; be **more generous** where the law allows; never go below the legal floor (Q3) |
| **Company policy** | The company | Everything: change, replace or add rules, using any field; start from the labelled starter template |
| **Platform safety** | YukthiX | Nothing: security, audit, tenant isolation, period locks, employees' own-document access, consent (listed in §3) |

## 2. What exists today
- **Exam app:** approval chains with fixed gates; custom fields without conditions.
- **Design:**
  - P03 condition builder for approval routing (registered fields per request type);
  - P07 typed statutory evaluator;
  - P09 formula builder for calculated metrics;
  - P18 show / hide / require conditions and pick-list validation;
  - module docs define policies as settings with starter values (D17);
  - YX-CUST-11 limits custom fields in governed calculations.
- **Missing:**
  - one expression language;
  - custom fields as inputs to module policies;
  - record validation rules;
  - automations;
  - impact preview.

## 3. Concepts
- **Rule:** a named, versioned, effective-dated company rule with a **type**, a **scope** (entity / location / department / grade / employee group / custom-field condition), a **priority** and an **owner module**. Types:

  | Type | What it does | Example |
  |---|---|---|
  | **Policy value** | Decides a value a module uses | "Casual leave = 12 days; **if** *Site type* = Mine **then** 14" |
  | **Eligibility** | Decides who gets something | "Mileage claim allowed **if** *Vehicle owned* = Yes **and** grade ≥ G4" |
  | **Validation** | Blocks or warns on save | "Joining date can't be a Sunday"; "*Uniform size* required when department = Plant" |
  | **Routing** | Chooses an approval path (P03) | "Expense > ₹10,000 **and** *Project billable* = Yes → Project manager, then Finance" |
  | **Automation** | Does something when an event or time condition holds | "When *Probation grade* = C → create review task for HRBP, notify manager" |
  | **Layout condition** | Shows / hides / requires fields (P18) | "Show *Licence number* when *Vehicle type* = Two-wheeler" |
  | **Formula** | Calculates a field or metric | "*Tenure band* = years since joining, bucketed"; custom pay component amounts (company components only) |

- **Policy points:** each module **registers** the places where a company rule can plug in. Each point has a name, the value type it expects, the record context, and the fields available (built-in + custom + related). Examples:
  - leave entitlement, accrual and carry-forward;
  - attendance late marks and overtime eligibility;
  - expense limits and eligibility;
  - allowance and deduction amounts for **company pay components**;
  - probation length;
  - notice period;
  - bonus eligibility;
  - test retake rules;
  - interview panel selection.

  **A module never hard-codes policy.** It asks the rule engine at a policy point and gets the starter rule unless the company changed it (D17).
- **Expression language:** one typed language used by every rule. Offered as a **no-code builder** (field → operator → value; AND / OR groups; "any / all of related records") and, per Q1, as a **formula editor** (spreadsheet-style functions: `IF`, `AND`, `OR`, `CASE`, date maths, `DAYS_BETWEEN`, `ROUND`, `LOOKUP`, `COUNT` over related records, text functions).
  - **Types are checked at save**; errors are shown in plain language.
  - **Deterministic and sandboxed:** no loops, no external calls, and time-limited.
  - **Fields are referenced by their fixed API names**, and labels are shown in the builder. Renaming a label never breaks a rule. Deleting a field used by a rule is blocked until the rule is changed.
- **Lookup tables:** company-maintained tables that rules read (e.g. city tier → per-diem, grade → mileage rate, site → shift allowance). Effective-dated (P06).
- **Automation actions:**
  - create task;
  - notify (P04);
  - update a field (company and custom fields only; never a governed field);
  - start a request (P03);
  - create a record (custom object or allowed core record);
  - add to group / talent pool;
  - send webhook (P11);
  - schedule a follow-up.

  Triggers are events (APX-B), a field change, or a time condition ("30 days before contract end").
- **Law guard:** where a policy point has a legal floor or cap in P07 (minimum wage, statutory leave minimum, overtime limits, maternity weeks, gratuity formula, PF / ESI / PT / TDS), the engine **evaluates the company rule and then applies the law**. A result below the floor or above the cap is raised to or clamped at the legal value, and the rule shows a warning at save ("For 23 employees in Karnataka this gives less than the statutory minimum; the law will apply").
- **Protected (never editable) areas:**
  - authentication and security policies below the P12 floor;
  - audit logging;
  - tenant isolation;
  - locked periods (P08);
  - employees' access to their own payslips / Form 16 / letters;
  - consent and privacy rules (P02, T05);
  - statutory calculations themselves (P07).

  Rules may *read* these values, never change them.
- **Test mode and impact preview:** before activating, the author runs the rule against live data (read-only) or the sandbox:
  - *who* is affected;
  - old vs new value per person;
  - money impact (sum / average);
  - validation failures on existing records;
  - automation runs that would fire.

  Also: side-by-side version diff and "test on one employee".
- **Versioning & effective dating:** each change is a new version with an effective date. Past periods keep the rule version that applied then. A back-dated change follows P06 retro (arrears proposal, never rewriting locked payslips).
- **Conflicts:** for the same policy point and person, the most specific scope wins (employee > group > grade > department > location > entity > tenant), then priority. The builder shows overlaps and unreachable rules.
- **Notice of change and policy link (J5):** policy points that are **conditions of service** of workmen (IR Code Fourth Schedule matters: wages, hours, leave, shifts, etc.; flag on the policy point) can't take effect for workers until the statutory **notice of change** period has run from issue of the notice (IR Code, 21 days, verify); the builder issues the notice (P05, APX-F) to affected workers and the recognised union (M01). Every rule version links to the **M08 policy version** it implements, and a material change can require **re-acknowledgement** (YX-POL-01).

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `policy_points` | Platform catalogue: module, key, value type, record context, available field paths, legal-guard ref (P07), risk level |
| `rules` | `organization_id`, type, policy point / record type / trigger, name, owner module, scope, priority, status (draft / in review / active / retired), starter ref |
| `rule_versions` | Rule × version: expression (typed AST, JSON), effective from / to, author, reviewer, change note, impact-preview ref |
| `lookup_tables` + `lookup_rows` | Company tables used by rules, effective-dated |
| `automation_runs` | Rule version × trigger × record: actions taken, result, error, duration (for audit and replay) |
| `rule_evaluations_log` | Sampled / on-demand explanations: inputs, result, legal adjustment applied (for "why did I get this?") |
| `impact_previews` | Rule version × run: affected count, per-person diffs (stored briefly, P02 classes applied), money impact, validation failures |
| Notice of change & policy link (J5) | `policy_points.conditions_of_service` flag; `rule_versions.policy_version_id` (M08), `requires_reack`, `notice_of_change_id` → `notices_of_change` (issued_at, period_days from P07 `IN.IR`, earliest_effective, audience, union_id?, document_id, exception basis settlement / award) |

All carry `organization_id` + RLS, except `policy_points`, which is a platform catalogue. A rule that reads Confidential / Special fields inherits that class for its previews and logs.

## 5. Rules (YX-RULE)

| ID | Rule |
|---|---|
| YX-RULE-01 | Every company-variable decision in the product is a registered **policy point** answered by the rule engine. Modules ship starter rules, never hard-coded policy (D17 / D19). |
| YX-RULE-02 | Rules may use any field the author is allowed to see: built-in, custom (P18) or related, referenced by fixed API names. A field used by an active rule can't be deleted or change type until the rule is updated. |
| YX-RULE-03 | Where P07 defines a legal floor or cap, the legal value always applies over a company rule, per Q3. The builder warns at save with the number of people affected. |
| YX-RULE-04 | Protected areas (§3) can't be changed by any rule. Automations can update only company-owned and custom fields, never governed fields (statutory values, locked payroll, audit, consent). |
| YX-RULE-05 | Expressions are type-checked at save, deterministic, side-effect free (except automation actions), time-limited and never call outside systems. External effects go only through P11 webhooks. |
| YX-RULE-06 | Every rule change is versioned, effective-dated and audited. Changes to rules touching pay, leave balances, access or data visibility need a second-person approval (P02 maker ≠ checker). |
| YX-RULE-07 | A rule can be activated only after an impact preview has been run on current data (or the sandbox). The preview result is stored with the version. |
| YX-RULE-08 | Back-dated changes follow P06 retro: arrears or balance adjustments are proposed, and locked periods and issued payslips are never rewritten (P08). |
| YX-RULE-09 | Conflicts are resolved by most specific scope, then priority. Overlapping or unreachable rules are shown in the builder. |
| YX-RULE-10 | Any person affected by a rule can see a plain-language **"why"** for their result (e.g. leave entitlement), naming the rule and any legal adjustment, without seeing other people's data. |
| YX-RULE-11 | Automations have loop protection (a rule's action can't re-trigger the same rule on the same record within one chain), daily run limits per tenant (fair use, D18), and retry with backoff. Every run is logged. |
| YX-RULE-12 | Rules move between sandbox and production through P15 promotion when the company turns on "promotion required". Starter rules are never changed in a tenant by YukthiX updates without the company's acceptance (YX-CUST-10 pattern). |
| YX-RULE-13 | **Notice of change (J5).** A rule version on a conditions-of-service policy point that changes the result for any worker (P07 worker classification) can't be activated with an effective date earlier than notice issue + the P07 `IN.IR` notice period (21 days, verify); the notice is generated and issued to affected workers and the recognised union; exceptions allowed by law (a settlement or award, M08 YX-CASE-18) are recorded with the reference. Law is the floor: a company may give a longer notice (D17). |
| YX-RULE-14 | **Policy link and re-acknowledgement (J5).** Every active rule version names the M08 policy version it implements; activating a version marked material publishes / links the policy version and starts re-acknowledgement for the affected audience (YX-POL-01); a rule with no policy link can't be activated on an employee-facing policy point. |

## 6. Flows
1. **Change a policy:**
   1. Settings › *module* › Policies.
   2. Open the starter rule.
   3. Edit in the builder (add conditions using any field, or add a lookup table).
   4. Pick scope and effective date.
   5. Impact preview.
   6. Submit for approval if the rule is high-risk.
   7. Activate.
   8. Employees see the new result with a "why".
2. **Add a custom field and use it:**
   1. Add *Site type* (pick-list) to Location (P18).
   2. Use it in the leave entitlement rule: "if location.*Site type* = Mine then 14".
   3. Preview shows 180 employees +2 days.
   4. Activate.
3. **Validation rule:**
   1. Record type → condition → message → block or warn.
   2. Test on existing records.
   3. Activate. Existing invalid records are listed, not blocked, until next edit.
4. **Automation:**
   1. Pick trigger (event / field change / time).
   2. Conditions.
   3. Actions.
   4. Dry run on the last 30 days of events.
   5. Activate.
   6. Run log.
5. **Legal floor hit:** the author sets overtime at 1.5×. P07 says 2× for factory workers. At save, a warning shows 312 workers where the law applies. In payroll, those workers get 2×, and their "why" explains it.

## 7. UI
- **Policies page per module:** list of policy points with the active rule and scope chips, "starter" or "customised" badge, last change.
- **Rule builder:**
  - condition groups with a field picker (search built-in, custom and related fields, with type icons);
  - operators by type;
  - value inputs;
  - formula tab (Q1);
  - lookup table editor;
  - plain-language summary ("Employees at Mine sites get 14 casual leave days").
- **Impact preview panel:** counts, top changes, money impact, download (respects P02).
- **Automations:** list, run log, failure queue.
- **"Why" link** on employee-facing results.

## 8. Migration & rollout
- **Wave 1:**
  - engine, expression language, builder;
  - P03 routing and P18 layout conditions move onto it;
  - validation rules.
- **Wave 2:** automations; leave / attendance policy points.
- **Following waves:** each module's policy points as it ships (payroll company components wave 3, expenses / performance wave 5, and so on).

Existing exam-app approval chains become routing rules (P03 §8).

## 8b. P22 cross-reference (28 Sep 2026)
- Automations are **extended by [P22](P22-workflow-studio-ai-assistant.md) Workflow Studio** (wave 2): multi-step workflows with waits, branches, loops, approvals, error handling, undo and a template gallery.
- Every P19 automation becomes a **one-step workflow** (simple mode) with no behaviour change; the §6 flow 4 form stays as the simple editor (YX-WFS-01).
- P22 reuses the P19 expression language, impact preview (YX-RULE-07), second approver (YX-RULE-06), protected fields (YX-RULE-04) and loop protection (YX-RULE-11).
- Q2 is widened by P22: approved-endpoint HTTP calls and P10 connector actions become workflow steps; scripts only as the P22 sandboxed script step (wave 6).

## 9. Acceptance tests (samples)
- A leave rule using the custom field *Site type* gives 14 days at Mine sites; renaming the field's label doesn't affect it; deleting the field is blocked while the rule is active (YX-RULE-02).
- A company rule paying overtime at 1.5× results in 2× for factory workers covered by the law, with a save-time warning naming the count (YX-RULE-03).
- An automation can't change a PF wage value or an issued payslip (YX-RULE-04, YX-RULE-08).
- Activating a rule without an impact preview is refused (YX-RULE-07).
- An employee sees "Casual leave 14 days: *Mine site rule* (company policy)" and nothing about other employees (YX-RULE-10).
- An automation that updates a field which triggers itself stops after one pass and logs a loop warning (YX-RULE-11).
- Changing factory shift timings from 1 Nov with the notice issued on 20 Oct is refused ("earliest 10 Nov", notice period per P07, verify); with the notice on 5 Oct it activates and affected workers are asked to re-acknowledge the shift policy v4 (YX-RULE-13/14; J5).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | How do companies write rules? | **Both:** a no-code builder for everyone **and** a formula editor for power users (spreadsheet-style functions), over the same engine; a rule written in the builder can be viewed as a formula and vice versa where possible. |
| Q2 | What can automations do? | **Internal actions** (task, notify, update company / custom field, start request, create record, add to group, schedule) **plus outbound webhooks** (P11). No direct calls to outside systems from rules; custom third-party connections remain paid customisation (D18). |
| Q3 | When a company rule conflicts with the law | **Law is a floor:** the company can choose legal options and be more generous; results below a legal floor / above a legal cap are corrected automatically with a warning. **Applicability** of a law to an entity (e.g. below an establishment-size threshold, not covered by a state's Act) is set per entity with a reason and supporting note, reviewed by the compliance owner (P07). |
| Q4 | Who can write rules? | *By principle (P02 / D17):* module policy owners and System Admin, per role permission; a second person approves rules touching pay, leave balances, access or visibility (YX-RULE-06). |
| Q5 | Back-dated rule changes | *By principle (P06):* allowed with arrears / balance-adjustment proposals; locked periods never rewritten (YX-RULE-08). |
| Q6 | Limits | *By principle (D18 fair use):* limits on active rules, lookup rows and automation runs per day shown on the usage page with 80 % / 100 % alerts; above that is a usage add-on. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Both:** a no-code builder for HR users **and** a spreadsheet-style formula editor for power users, on one engine; rules switch between the two views where possible. | 26 Sep 2026 |
| Q2 | **Internal actions + outbound webhooks:** create task, notify, update company / custom fields, start a request, create a record, add to a group, schedule a follow-up, send a P11 webhook. No direct external calls; custom third-party connections stay paid customisation (D18). | 26 Sep 2026 |
| Q3 | **Law is a floor:** companies choose legal options and may be more generous; a result below a legal floor or above a legal cap is corrected to the legal value automatically, with a save-time warning naming the people affected. Applicability of a law to an entity (e.g. below a size threshold) is set per entity with a reason and note, reviewed by the compliance owner (P07) (YX-RULE-03). | 26 Sep 2026 |
| Q4 | **By principle (P02 / D17):** module policy owners and System Admin write rules per role permission; a second person approves rules touching pay, leave balances, access or visibility (YX-RULE-06). | 26 Sep 2026 |
| Q5 | **By principle (P06):** back-dated changes allowed with arrears / balance-adjustment proposals; locked periods never rewritten (YX-RULE-08). | 26 Sep 2026 |
| Q6 | **By principle (D18 fair use):** limits on active rules, lookup rows and automation runs per day, with 80 % / 100 % alerts; beyond that is a usage add-on (YX-RULE-11). | 26 Sep 2026 |
| Validation pass 3 Should (J5), founder decision 28 Sep 2026 | **Notice of change before rule changes altering workmen's conditions** (IR Code notice period, 21 days, verify; P07 `IN.IR`), notice issued to workers and union; each rule version linked to its M08 policy version with re-acknowledgement. Wave 4. §3, §4, YX-RULE-13/14. | 28 Sep 2026 |
| P22 | **Automations extended by P22 Workflow Studio** (founder decision 28 Sep 2026): P19 automations become one-step workflows (simple mode); multi-step workflows, approved connections and the sandboxed script step are designed in P22 (YX-WFS-01–20). | 28 Sep 2026 |
