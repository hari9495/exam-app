# M03 · Payroll and statutory compliance · Build design (roadmap step 5)

> **Status:** 📝 Draft for founder review, 9 Oct 2026. Docs only, no code yet.
> **Scope:** the detailed build design for [M03](M03-payroll-and-statutory.md) (rules YX-PAY / YX-TAX, flows, decisions §11). It turns M03, [P07](P07-statutory-rules-as-data.md), [P06](P06-effective-dated-history.md) and [P08](P08-period-locks-and-audit.md) into tables, permissions, APIs, jobs, screens, tests and a build order of small pull requests.
> **Order:** ten batches, **5a → 5j**, with the same letters as the step-5 phases in the tracker (`tracker/stories/C.json`, epic EP-C-2). Batches 5a–5h are needed for the **private pilot** (M03: "the private pilot starts here"). Batch 5i is later waves. Batch 5j wires the screens and holds the go-live gates.
> **Backlog:** every slice in §17 names its stories: `US-C-077…162` (C.json), `US-A-150…157` and `US-A-060` (A.json), and the payroll stories of E.json (`US-E-212`, `226`, `253…255`, `281`, `285`, `323…325`, `333`, `347`).
> **Clean-room:** all features are described in our own words. No competitor or Frappe text, screens or field names are copied. The Frappe reference is used only for its listed defects, which our rules fix.

---

## 1. How to read this doc

- **§2** lists the decisions we follow. Nothing in this doc changes them.
- **§3** is the big picture: entity, pay group, period, the run lifecycle, corrections and reproducible runs.
- **§4** is where the code lives and what we reuse. **§5** is the data model. **§6** is roles and permission keys.
- **§7** is salary structures and formulas. **§8** is the statutory engine (P07). **§9** is the run engine. **§10** is inputs. **§11** is outputs.
- **§12** is security. **§13** is events and notifications. **§14** is the API. **§15** is screens. **§16** is tests.
- **§17** is the build order: PR-sized slices with stable IDs (`PAY-1.01` …). **§18** lists step-5 stories owned by other docs, and stories that are missing.
- **§19** is the short list of things still open. **§20** lists go-live items this design adds. **§21** is the change log.

Words used in this doc:

| Word | Meaning |
|---|---|
| **Legal entity** | The company that employs people and files returns (P01). It has one country, one currency, one TAN, and its own PF / ESI / PT / LWF registrations. |
| **Pay group** | One legal entity × one pay frequency × one pay calendar. Example: "Acme India · Monthly · Bengaluru staff". A run is always for one pay group. |
| **Pay period** | One period of a pay group (a month; a week or fortnight in 5i). It has a cut-off date and a lock stage (P08). |
| **Run** | One calculation of one pay group for one period. **Regular** (one per period) or **off-cycle** (F&F, bonus, arrears only, correction). |
| **Payslip** | The result for one employee in one run. Never changed after approval. |
| **Line** | One amount on a payslip (earning, deduction, employer contribution or info). It stores its formula, inputs and rule version. |
| **Component** | A kind of line (Basic, HRA, PF employee…). It has wage flags (part of the PF wage, ESI wage, Code wage…). |
| **Template** | An ordered list of components with formulas. Versioned. |
| **Compensation** | An employee's dated pay package (P06): template version + CTC or fixed amounts + overrides. |
| **Rule set** | A dated, versioned set of statutory values (P07), e.g. "PT · Karnataka · v2025-04". YukthiX maintains it once for all companies. |
| **Snapshot** | The frozen inputs of one payslip: facts, amounts, rule-set versions, template version, engine version. It lets us reproduce the payslip exactly. |
| **Maker / checker** | The person who prepares, and the different person who approves (YX-SEC-12). |
| **Step-up** | A fresh passkey / TOTP check before a sensitive action (P12 YX-IAM-02). |
| **Verify flag** | A mark on a statutory figure that the YukthiX compliance owner has not yet confirmed (P07 YX-STAT-13). Shown to the company, never hidden. |

---

## 2. Decisions this design follows

| Source | Decision (short) | Where it shows here |
|---|---|---|
| M03 Q1 | CTC-first by default; fixed-amount entry per employee; both make the same dated compensation | §7.4, PAY-2.08, PAY-2.09 |
| M03 Q2 | Two-level run approval by default (Payroll Admin → Finance approver / HR head); company can add levels through P03, or use one level | §9.6, PAY-3.09 |
| M03 Q3 + V5 | Monthly + off-cycle at launch; weekly / fortnightly screens in wave 3 | PAY-7.01, PAY-9.01 |
| M03 Q4 | Salary advances and loans with EMI and optional interest; perquisite tax from P07 | §10.4, PAY-3.12 |
| M03 Q5 | Declaration window at year start; proof window Jan–Feb; line-by-line checks; extra tax spread over the remaining months | §8.6, PAY-5.03 |
| M03 Q6 | TDS: self-file (our FVU check, HR uploads) **and** filing partner, chosen per entity; Part B is ours, DSC-signed | §11.5, PAY-6.05, PAY-6.06 |
| M03 Q7 | PF / ESI / PT / LWF: portal-ready files, or filed by a compliance partner (add-on); no portal bots, no stored government passwords | §11.4, PAY-6.02, PAY-6.06 |
| M03 Q8 | Statutory bonus paid annually (default, with a monthly provision) or monthly, per entity | PAY-3.15 |
| M03 D1 | Attendance mode per group; manual LOP for Assumed-present groups; block / warn per the P08 setting | §10.1, PAY-3.02, PAY-3.03 |
| M03 D4 | Rate-based pay (hourly / daily) from the M02 timesheet feed; lines carry `placement_id` | PAY-3.16 |
| M03 D11 | Payment-failure flow with the expedited bank fix (checker + penny-drop) | PAY-4.02 |
| M03 D13 | Payslip query queue in the app (moves into M08 in wave 5) | PAY-4.06 |
| M03 E-*, J-*, C1, C2, A8, A9, B1, B10, C4, R5, R8, V1–V7, J4 | As written in M03 §11: maternity, death in service, holds, cash / cheque, court orders, Code wage, F&F in 2 working days, retrenchment, Form 130 / 138 law version, supplementary filings, revised certificates, as-paid import, coverage monitor, PT state change, ELI, PwD ceiling, consultants, registers, EWA, country packs, ESOP, special pay | §8–§11, batches 5c–5i |
| P07 Q1–Q8 | Rules central and dated; companies pick legal options only; maker ≠ checker + partner CA audit; typed tables + small evaluator; TDS calculator per year; late rule changes → arrears proposal; full India pack; minimum wages for all states from the pilot; only India built | §8 |
| P06 Q4 / Q5 / Q6 | Payslips never altered; arrears in the next run; retro changes tiered; mid-period method per change type | §3.4, §7.6 |
| P08 | Open → frozen → locked → filed; lock on approval; reopen only before payment / publish / filing; audit hash chain | §3.3, batch 5a |
| P02 Q3 / Q6 | No team salary view unless the company enables it; maker ≠ checker when two or more can approve, else self-approval with a reason | §12 |
| P10 Q5 / Q6 / Q7 | Bank files at launch (HDFC, ICICI, SBI, Axis, Kotak + generic NEFT / RTGS); payout API add-on later; PAN and penny-drop checks through a partner; journals to Tally, Zoho Books, CSV + Accounting API | §11 |
| P05 Q2 / Q7 | Company DSC signs Form 130 and letters; PAN, Aadhaar and bank proof verified before payroll uses them | §11.6, PAY-3.03 |
| P04 Q6 | No pay figures outside the app: notices carry an in-app link only | §13 |
| P12 Q1 | MFA mandatory for payroll roles; step-up on sensitive actions | §12.3 |

---

## 3. How payroll fits

### 3.1 The chain

```
Legal entity (country, currency, TAN, registrations, legal options)
  └─ Pay group (frequency, pay calendar, cut-off day, pay day)
       └─ Pay period (e.g. 2026-10; stage: open → frozen → locked → filed)
            └─ Run (regular: one per period · off-cycle: any number)
                 └─ Payslip per employee (snapshot + lines + explanations)
```

- One legal entity has one country pack (India first). So one run = one country = one currency (YX-PAY-43).
- An employee is in exactly one pay group per period. It is read from their dated assignment (P06). A transfer to another entity ends one employment and opens another (P01): two payslips, two entities, tax combined per PAN × TAN × FY (YX-TAX-13).
- **One regular payslip per period and pay group** (YX-PAY-04). The database enforces it: a unique index on (`employment_id`, `pay_period_id`) for regular payslips that are not void.

### 3.2 The run lifecycle

| Status | What happens | Who | Next |
|---|---|---|---|
| `draft` | Run created for a period. Inputs still open. The readiness screen shows blockers. | Payroll Admin | `calculating` |
| `calculating` | Inputs are **frozen** (period → `frozen`). Pre-run validation runs, then the fan-out job computes each payslip with per-employee progress (YX-PAY-34). | system | `calculated` if every payslip succeeded; else back to `draft` with named failures |
| `calculated` | Variance review, exception filter, "why this number". Can recalculate (new calc version) or void. | Payroll Admin | `in_review` |
| `in_review` | Flagged variances must be acknowledged (YX-PAY-06). Submit opens a P03 request. | Payroll Admin (maker) | `submitted` |
| `submitted` | Approval chain (Q2), maker ≠ checker, step-up. Reject sends it back to `in_review`. | Approvers (checkers) | `approved` |
| `approved` | **Period locked**, with attendance and pay-affecting leave (YX-LOCK-04). Payslips become immutable. Bank file, publishing and journal are now allowed (YX-PAY-07). | system | `paid` |
| `paid` | Every payslip has a result: paid, failed, returned, held or cash. Failed ones go into the next bank file or an off-cycle payment. | Payroll Admin | end |
| `void` | Cancelled after calculation, before approval. Never deleted; payslips kept as void (YX-PAY-08). | Payroll Admin | end |

**Publishing** payslips and **posting** the journal are separate flags on the run (`published_at`, `posted_at`), not statuses. Both are allowed any time after approval, in any order. **Filed** belongs to each statutory filing of the period (§11.4), not to the run.

Short form: **draft → calculate → review → maker / checker approve → lock → pay → publish / post**.

### 3.3 Period lock stages (P08)

| Stage | Set when | Effect on writes (lock service, YX-LOCK-01) |
|---|---|---|
| `open` | Period created | Normal writes. |
| `frozen` | Cut-off date reached, or the run starts calculating | Employee changes only as late requests with an extra HR step (YX-LOCK-02). Payroll inputs only by the Payroll Admin. |
| `locked` | Regular run approved | Nothing in the period changes. New facts become dated corrections paid in the next run (YX-LOCK-03). |
| `filed` | A return for the period is filed | Same as locked. Reopen is refused (YX-LOCK-05). |

The lock service is one SQL function, `pay_period_stage(org, legal_entity, date)`, called **inside the same transaction** as every pay-affecting write (attendance, pay-affecting leave, payroll inputs, paid expenses). A `BEFORE` trigger on those tables calls it too, so a missed check in code still fails.

**Reopen** (US-C-080) is a high-risk P03 request: reason, Payroll Admin + System Admin / owner approval, step-up. It is refused once the bank file is released, payslips are published, or a return is filed. A reopened run makes **new payslip versions**; old versions stay, marked "revised" (YX-LOCK-06).

### 3.4 Corrections only in the next run (YX-HIS-08)

- An approved payslip is never edited. A database trigger refuses `UPDATE` on `payslips` and `payslip_lines` after approval, except the status columns (payment status, publish time). `DELETE` is never granted to the app role.
- A change that reaches a processed month (back-dated revision, late leave, wrong LOP, missed allowance) becomes a **correction**. P06 classifies it (YX-HIS-12) and adds a Payroll Admin step. The **arrears engine** (PAY-7.02) puts the difference into the next run as named arrears or recovery lines, per month and per component, with the reason and the source change id.
- PF / ESI for a month already filed go out as a **supplementary filing** (YX-PAY-51), never a re-upload.
- For months before go-live, the base is the **imported as-paid lines** (YX-PAY-52).

### 3.5 Reproducible runs (YX-HIS-09)

Every payslip stores a **snapshot** (`payslip_snapshots`):
- the facts used (assignment, location state, employment type, statutory profile, tax regime) with their P06 segments;
- the compensation version and the template version;
- every input row (attendance feed rows, LOP, one-time pay, loan EMIs, tax workspace state) by id **and** by value;
- the rule-set versions used (statute × jurisdiction → version);
- the engine version (calculator versions and the build id);
- a SHA-256 hash of the inputs, and a hash of the result lines.

The calculation is a **pure function**: `calculatePayslip(snapshot, ruleSets) → lines`. It reads no database and no clock. So:
- "Reproduce this payslip" (an auditor action, and a nightly sample job) runs the function again from the snapshot. The result hash must match.
- Golden-file tests and property tests (§16) call the same function.
- An old payslip is reproduced with the rule versions it used, not today's rules.

---

## 4. Where it lives and what we reuse

**Code:** a new NestJS area `apps/api/src/payroll/`, one module per part: `setup`, `structures`, `compensation`, `engine` (pure calculation, no Nest or Prisma imports), `runs`, `payout`, `tax`, `filings`, `registers`, `consultants`, `fnf`, `special` (5i). The statutory evaluator lives in `apps/api/src/statutory/`, because M02 already reads `statutory_rule_sets` and M05, M08 and M13 will too. Prisma models go in the existing `schema.prisma`. Migrations follow the existing pattern (forced RLS + `tenant_isolation` in every migration). Screens come from `packages/yx-ui/src/screens/pay` and `ops` (compliance) and are wired to real APIs.

**Reuse first.** We build only what does not exist.

| Need | Reuse | Status today |
|---|---|---|
| Tenant isolation | `app_current_org()`, forced RLS, `tenant_isolation`, `TenantPrismaService.forTenant` | Built (step 0) |
| Hide pay from support sessions | `support_session_excluded` restrictive policy (already on `compensations`, `employee_identifiers`, `employee_bank_accounts`) | Built (step 3); added to every pay table |
| Encrypted identifiers | `OrgSecretsCryptoService` (`encrypt`, `hmac`), `sealValue` / `hashValue`, `maskTail`; `employee_identifiers` (PAN, UAN, ESIC, Aadhaar), `employee_bank_accounts` | Built (step 2) |
| Dated facts and segments | `dated_fact_guard()`, `EmployeeHistoryService.segments()`, change types and retro tiers (YX-HIS-12) | Built (step 2) |
| Compensation (thin) | `compensations` (annual CTC, dated, change id) | Built (step 2); extended in PAY-2.09 |
| Settings with scope precedence | `settings` + `settings-registry` `resolveSetting` (employee → … → location → legal entity → tenant, dated) | Built |
| Permissions | P02 keys, `ROLE_TEMPLATES` (`payroll_admin`, `payroll_approver` exist), `RequirePermissions`, field redaction | Built (step 2) |
| Step-up | `@RequireStepUp` (P12) | Built (step 1) |
| Approvals | P03 `ApprovalsEngine` in `workflow/` (request types, steps, quorum, delegation, self-approval rule, audit) | Built (step 3b / 4) |
| Conditions and formulas | P19 `rules-engine/conditions.ts` (typed condition trees), `forms.ts` formula fields | Built (step 3b) |
| Statutory rule table | `statutory_rule_sets` (read-only to the app; `IN.SE`, `IN.LEAVE` rows) | Built (step 4 batch 1); upgraded in PAY-2.01 |
| Time and leave | `apps/api/src/time` (day engine, leave ledger, attendance days, holiday calendars) | Batch 1 built on `feat/yukthix-time-leave` |
| Jobs | BullMQ 5.x + Redis | Built |
| Files | Blob storage service (`packages/shared`) | Built |
| Excel / PDF | `exceljs`, `pdfkit` | Installed |
| Audit | `AuditService.recordIn(tx, …)` (same transaction) | Built; hash chain added in PAY-1.05 |
| Money | `Prisma.Decimal` (decimal.js inside Prisma) | Installed. **Never JS numbers for money.** |

**Step-4 pieces that payroll needs.** If step 4 has not merged one of these when a step-5 slice starts, that slice builds the minimum **in the shared place** (not inside `payroll/`), as M14 did for P03 and P19:

| Needed piece | Step-4 story | Used by |
|---|---|---|
| Attendance feed to payroll (M02 §B6) | US-C-064 | PAY-3.02 |
| P07 publish with review; legal options | US-C-024, US-C-025, US-C-026 | PAY-2.01, PAY-2.04 |
| Document store, versions, e-sign evidence | US-C-028…030 | PAY-1.09 |
| Email templates; scheduler | US-C-015, US-C-018 | §13, PAY-6.01 |
| Maker ≠ checker in P03 | US-C-006 | PAY-3.09 |

**New libraries** (open source, widely used, maintained):

| Library | Use | Why this one |
|---|---|---|
| `jsep` | Parse formula text into a syntax tree | A parser only. It never runs code; we walk the tree ourselves (§7.2). |
| `fast-check` (dev only) | Property tests for statutory maths | The standard property-testing tool for TypeScript. |
| `@signpdf/signpdf` (+ its PKCS#11 / P12 signer) | PAdES signature on Form 130 / 131 and registers | Maintained PDF signing library. Exact signer follows §19 D4. |
| Government **FVU** (Java utility from the TIN site) | Validate Form 138 / 140 files before upload | Required by the filing process (M03 Q6). Runs in a worker container with no network access. |

No other new runtime dependency. ECR, ESI, PT and LWF files, bank files and registers are **data-driven writers** on top of `exceljs` and plain text, built from the published formats (no library exists for them).

---

## 5. Data model

### 5.1 Rules for every pay table

- Plain names as in M03 §4 (`pay_components`, `payroll_runs`, `payslips`…). Primary key `id uuid`. Every row has `organization_id` and, where it has one, `legal_entity_id`.
- **Forced RLS** with the standard `tenant_isolation` policy. The CI test `rls-raw-client-guard.spec.ts` is extended: a new pay table without the policy fails CI.
- **Support sessions excluded:** every pay table gets the existing `support_session_excluded` restrictive policy. YukthiX support never sees pay, even in an approved support session.
- **Pay visibility guard** (second layer, in the database). A `RESTRICTIVE` policy on every table that holds one person's pay (payslips, lines, snapshots, compensation lines, tax, loans, holds, F&F, consultant invoices). A row passes only when:
  - it belongs to the signed-in person (`employee_id = ANY(app_current_employee_ids())`, built on the existing `app_current_person_ids()`), **or**
  - its `legal_entity_id` is in `app_pay_entities()`: the entities where the user holds a pay-reading key. The API sets it per transaction (`SET LOCAL app.pay_entities`) from the same P02 grant resolver it already uses, next to `app.current_user`.
  - There is **no super-admin escape** in this policy.
  - Finer scopes (a location, a department) are applied by the app on top (P02 visibility service).
- **Composite foreign keys** `(organization_id, id)` as in the people tables. A row can never point at another company's row.
- **Money:** `NUMERIC(14,2)` in the database, `Prisma.Decimal` in code. Rates are `NUMERIC(9,6)`. Days are `NUMERIC(6,2)` (half days).
- **Encryption.** Identifiers are never copied into pay tables in clear:
  - PAN, UAN, ESI IP number and bank account stay in `employee_identifiers` / `employee_bank_accounts` (already encrypted + keyed hash + last 4).
  - Pay tables store only the **reference** and the **last 4**. Statutory and bank file writers decrypt inside the worker, at generation time only.
  - New identifiers in pay tables (consultant PAN / GSTIN / bank, court-order payee account, nominee account, US TIN) use the same `encrypt` + `hmac` + last-4 pattern.
  - Generated files (bank files, ECR, Form 138, registers, payslip PDFs) are encrypted at rest in blob storage with the company's key (US-A-160).
  - Amounts are plain columns protected by the two RLS layers. See §19 D5.
- **Immutability:** approved payslips, lines and snapshots, filed filings and signed registers are protected by `BEFORE UPDATE / DELETE` triggers (only listed status columns may change). Every write to them is also audited (YX-AUD-01).
- **Dated rows** use `valid_from` / `valid_to` with `dated_fact_guard()` (no overlaps). See §5.11.
- `created_at`, `created_by`. Rows that admins edit have a `version int` for optimistic locking.

### 5.2 Batch 5a · Locks, audit, documents

| Table | Key fields | Notes |
|---|---|---|
| `pay_periods` | legal entity, pay group, period key (`2026-10`), start, end, cut-off at, stage (`open`, `frozen`, `locked`, `filed`), locked by run, locked at | One row per pay group × period. The P08 lock stage lives here. |
| `period_lock_events` | period, from stage, to stage, by, reason, at | History of every stage change (incl. reopen). |
| `period_reopen_requests` | period, run, reason, P03 request, status | High-risk request (YX-LOCK-05). |
| `audit_logs` (existing) + `prev_hash`, `row_hash`, `chain_seq` | — | Hash chain per tenant (YX-AUD-03). App role gets `INSERT`, `SELECT` only (YX-AUD-02). |
| `audit_anchors` | organization, last seq, last hash, verified at, result | Daily verify job writes one row. |
| `audit_legal_holds` | case ref, from, to, set by | Blocks archive / delete (YX-AUD-08). |
| `exchange_files` | kind (`bank`, `ecr`, `esi`, `pt`, `lwf`, `form138`, `form140`, `journal`, `register`, `wps`), owner ref (run / filing / register), blob key, SHA-256, size, rows, totals, generated by / at, released by / at, release P03 request, status (`generated`, `released`, `superseded`) | One shared table for every generated file (YX-INT-03). |
| `pay_documents` | kind (payslip PDF, Form 130 / 16, Form 131 / 16A, revision letter, payment advice, register PDF, inspection pack, correction statement), subject, template version, blob key, SHA-256, reference no. (gap-free per entity × kind), status (`issued`, `superseded`), supersedes id, DSC signature ref | Built on the P05 document store when it exists. |

### 5.3 Batch 5b · Setup, structures, compensation

| Table | Key fields | Notes |
|---|---|---|
| `statutory_registrations` | legal entity, statute (`IN.PF`, `IN.ESI`, `IN.PT`, `IN.LWF`, `IN.TDS`), state (PT / LWF), registration no., start date, responsible person, deductor address, status (`on`, `applied_awaited` with date, `off`), completeness ok | YX-PAY-36. TAN stays on `legal_entities` (exists). |
| `entity_statutory_options` | legal entity, option key (e.g. `pf.on_actual_wage`, `bonus.rate`, `bonus.payment`, `gratuity.provisioning`), value, `valid_from` | **Dated.** P07 legal options only. |
| `pay_groups` | legal entity, name, frequency (`monthly`, later `weekly`, `fortnightly`), currency, day basis (`calendar`, `30`, `26`), cut-off day, pay day, bank format, accounting mapping, payslip layout | Pay-group facts are columns here, not settings. |
| `pay_group_members` | pay group, employment, `valid_from`, `valid_to` | **Dated.** Default membership comes from a P19 condition on the pay group; overrides are rows. |
| `pay_components` | code, name, kind (`earning`, `deduction`, `employer`, `reimbursement`, `info`), flags (`taxable`, `pf_wage`, `esi_wage`, `pt_wage`, `gratuity_wage`, `bonus_wage`, `code_wage_part` / `code_exclusion`, `prorated`, `on_payslip`, `in_ctc`), proration formula, rounding, tax subject key (P07 cross-walk), ledger | Flags are columns (M03 §4). Code is fixed once used. |
| `salary_templates` | legal entity (nullable = all), name, status | |
| `salary_template_versions` | template, version, `valid_from`, CTC options (employer PF / ESI / gratuity inside CTC), balancing component, validated at, sample run result | **Versioned.** An edit makes a new version (YX-PAY-01). |
| `salary_template_lines` | template version, component, order, formula text, formula AST (`jsonb`), depends on (`text[]`) | AST is what runs (§7.2). |
| `compensations` (existing) + new columns: template version, entry mode (`ctc`, `fixed`), pay basis (`monthly`, `hourly`, `daily`), rate, OT / holiday multipliers, rate card ref | — | **Dated** (existing P06 pattern; written through employee changes). |
| `compensation_lines` | compensation, component, annual amount, monthly amount, override flag, reason | The computed breakup, stored for display, CTC report and audit. |
| `employee_statutory` | employment, PF eligible, EPS eligible, pre-2014 member, EPS higher-pension option, VPF %, PF on actual wage, international worker, ESI eligible, ESI contribution period, PwD ceiling consent, PT state override, LWF state override, `valid_from`, `valid_to` | **Dated.** Defaults by employment type from P07 (YX-ORG-20); UAN / IP number stay encrypted in `employee_identifiers`. |
| `establishment_coverage` | legal entity, establishment, statute, headcount basis, headcount, threshold, status, crossed on, rule-set version, evaluated at | P07 §5 (J1). |
| `opening_balances` | employment, FY, component or tax head, amount, source batch | YTD for mid-year starts (US-C-095). |
| `as_paid_lines` | employment, period, component, amount, import batch | Imported as-paid lines (YX-MIG-15). Locked periods, `source = import`. |
| `previous_employment_income` | employment, FY, employer TAN, gross, exemptions, TDS, Form 12B document | Feeds the projection. |
| `payslip_layouts` | legal entity, pay group (optional), P05 template ref, version, status | Locked mandatory fields from P07 (YX-DOC-22). |

### 5.4 Batch 5c · Runs and calculation

| Table | Key fields | Notes |
|---|---|---|
| `payroll_runs` | pay group, pay period, type (`regular`, `offcycle`), off-cycle kind (`fnf`, `bonus`, `arrears`, `correction`, `payment`), status (§3.2), calc version, P03 request, approved by / at, published at, posted at, totals (`jsonb`: gross, deductions, net, employer cost, headcount), void reason | |
| `run_employees` | run, employment, state (`queued`, `ok`, `failed`, `skipped`), failure (record, field, message), included reason | Per-employee progress (YX-PAY-34). |
| `run_validations` | run, employment (nullable), check key, severity (`block`, `warn`, `info`), message, waived by, waiver reason | YX-PAY-05 findings. |
| `payslips` | run, employment, legal entity, version, status (`draft`, `approved`, `void`, `revised`), segment list, gross, deductions, net, employer cost, rule-pack versions, snapshot hash, result hash, `source` (`run` / `import`), import batch, verify flag (any figure from a rule marked verify), payment status | Unique regular payslip per employment × period. |
| `payslip_lines` | payslip, component, segment no., amount, quantity / rate, formula text, inputs (`jsonb`), explanation, rule-set version, verify flag, `placement_id`, arrear-for period | One per component per segment (YX-PAY-03, YX-PAY-12). |
| `payslip_snapshots` | payslip, inputs (`jsonb`), rule versions (`jsonb`), engine version, inputs hash | §3.5. |
| `lop_inputs` | employment, period, LOP days, reason, source (`manual`, `upload`), entered by | Assumed-present groups (D1). |
| `attendance_feed` | employment, period, segment, payable days, LOP days, half days, OT hours by category, shift / night allowance days, comp-off, encashment drafts, timesheet hours by placement × category, feed version | Copied from M02 when the period freezes; the copy is what the run reads. |
| `one_time_pays` | employment, component, amount, period (or start / end for recurring), source (`manual`, `m05`, `m06`, `m09`, `m10`, `m08`, `m01`, `loan`, `arrears`), source ref, P03 request, status | |
| `variance_flags` | payslip, kind (`net_change`, `new_component`, `removed_component`), size, acknowledged by / at, note | YX-PAY-06. |
| `payroll_withholds` | employment, run, reason code, trigger, amount, released in run, released by | YX-PAY-28. |
| `pay_carry_forwards` | employment, origin run, balance, plan (`jsonb`), consent document, write-off P03 request | YX-PAY-29 / 30. |
| `court_orders` | employment, order ref, amount or %, priority date, payee (encrypted account), end date, remitted total | YX-PAY-32. |
| `loans` | employment, type (`advance`, `loan`), principal, interest rate, EMI schedule (`jsonb`), perquisite flag, P03 request, status | Q4. |
| `loan_repayments`, `loan_schedule_changes` | loan, payslip line or F&F, amount; change kind (`pause`, `preclose`, `reschedule`), reason | |
| `gratuity_provisions`, `bonus_computations` | employment, month / FY, wage, years, amount, rule version | |
| `journals` | run, entity, lines (`jsonb`: ledger, cost centre, debit, credit), export status per target, posted ref | P10 Q7. |
| `employee_cost_rates` | employee, month, employer cost, standard hours, rate, source, provisional | YX-PAY-42. |

### 5.5 Batch 5d · Pay-out and payslips

| Table | Key fields | Notes |
|---|---|---|
| `bank_formats` | key (`generic_neft`, `hdfc`, `icici`, `sbi`, `axis`, `kotak`…), version, layout (`jsonb`: columns, order, widths, header / trailer rows, date and amount formats, file type), `valid_from` | **Platform data** (no tenant key), maintained by YukthiX like P07 rule sets. |
| `bank_files` | run, debit account (ref), bank format version, exchange file, rows, total, generation no., regeneration reason | YX-PAY-13. |
| `payment_status` | payslip (or invoice / F&F line), status (`pending`, `paid`, `failed`, `returned`, `held`, `cash`), bank reference, return reason, re-pay route, recorded by | YX-PAY-14. |
| `employee_payment_mode` | employment, mode (`bank`, `cash`, `cheque`), reason, P03 request, `valid_from` | **Dated.** YX-PAY-31. |
| `disbursement_registers` | run, employment, cheque no., paid at, acknowledgement document | |
| `payslip_queries` | payslip, line (optional), employee, text, status, assignee, replies | YX-PAY-25. |

### 5.6 Batch 5e · Income tax

| Table | Key fields | Notes |
|---|---|---|
| `tax_workspaces` | employment, tax year, law version, regime, regime locked at, residential status, TRC / 10F document, 10(10AA) prior use | One per employment per tax year. |
| `tax_declarations` + `tax_declaration_lines` | workspace, window, status; line: subject key (P07 cross-walk), amount, landlord PAN (encrypted), months | Form 12BB data (or its successor). |
| `tax_proofs` + `tax_proof_lines` | declaration line, documents, status (`pending`, `approved`, `partly`, `rejected`), approved amount, verifier, comment | Verifier ≠ the employee (YX-TAX-05). |
| `other_income` | workspace, kind, amount | |
| `tds_projections` | run, employment, law version, calculator version, projected income, exemptions, tax, already deducted, remaining periods, this month TDS, explanation (`jsonb`) | One function makes both the sheet and the TDS (YX-TAX-06). |
| `perquisites` | employment, kind (car, accommodation, loan, ESOP, other), value, rule version | Form 12BA. |

### 5.7 Batch 5f · Statutory filings and registers

| Table | Key fields | Notes |
|---|---|---|
| `statutory_filings` | legal entity, statute, state, period, kind (`original`, `supplementary`, `excess_adjustment`, `excess_refund`), corrects filing, filing mode (`self`, `partner`), status (`draft`, `generated`, `uploaded`, `acknowledged`, `filed`; partner: `transmitted`, `filed_by_partner`, `rejected`), exchange file, acknowledgement / TRRN / challan no., partner ref | P08 `filed` lock on the period once filed. |
| `statutory_penalty_lines` | filing, kind (`7Q`, `14B`, `esi_interest`, `esi_damages`, `ec_interest`, `ec_penalty`, `tds_interest`, `234E`), days late, base, rate / band, amount, rule version, paid ref | Employer cost, never from employees. |
| `tds_challans` | legal entity, deposit month, section subject key, law version, TDS, interest, fee, challan no., BSR, deposit date, manual edit reason | Shared by salary and consultant TDS. |
| `tds_returns` | legal entity, form code (`24Q`, `26Q`, `138`, `140`), law version, quarter, kind (`original`, `correction`), corrects, deductee rows source, reconciliation result, FVU result, token no., status | One model for both modes (Q6). |
| `form16_documents` / `form16a_documents` | employment or consultant, tax year / quarter, form code, law version, Part A source, document, revision no., supersedes, correction return | Form 130 / 131 (or 16 / 16A for old periods). |
| `statutory_registers` | legal entity, location, register type, period, P07 format version, version, status (`generated`, `frozen`, `signed`, `superseded`), supersedes, reason, PDF / XLSX documents, DSC ref | YX-PAY-39. |
| `inspection_packs` | legal entity, location, period, register versions included, document | |
| `eli_eligibility` | employee, `IN.ELI` version, category, eligible from / to, prerequisites, expected vs received per ECR month | R5. |
| `advisory_reviews` | advisory code, legal entity, reviewed by / at, note, task | P07 B17. |

### 5.8 Batch 5g · Off-cycle, arrears, F&F

| Table | Key fields | Notes |
|---|---|---|
| `arrears_worksheets` | employment, source (change id / rule-set proposal / settlement), from period, to period, status, approved in run | |
| `arrears_worksheet_lines` | worksheet, period, component, as-paid, corrected, difference, base source (`payslip`, `import`, `confirmed`), confirmed by + reason | YX-PAY-52. |
| `statutory_arrears_proposals` | rule-set version, legal entity, periods, employee count, status (`open`, `accepted`, `dismissed`), reason | P07 Q4. |
| `fnf_settlements` | employment, exit type, LWD, deadline (2 working days), run, status, blocked items (`jsonb`), second run, payees (nominees / heirs with share and encrypted account) | YX-PAY-48 / 27. |

### 5.9 Batch 5h · Consultants

As M03 §4: `consultants` (PAN, GSTIN and bank **encrypted** with hash + last 4; Special), `consultant_invoices`, `tds_197_certificates`. A consultant sees only their own rows through the Consultant login (P02 §4.7); the RLS guard uses `app_portal_person()` (exists).

### 5.10 Batch 5i · Special pay (later waves)

As M03 §4, one migration per slice: `ewa_policies`, `ewa_draws`, `ewa_partner_settlements`, `piece_rate_cards`, `piece_outputs`, `incentive_plans`, `incentive_results`, `commission_clawbacks`, `tip_pools`, `tip_distributions`, `oncall_pay_rules`, `union_checkoff_authorisations`, `union_remittances`, `wage_settlements`, `settlement_category_rates`, `vrs_payouts`, `actuarial_census_exports`, `actuarial_valuations`, `equity_plans`, `equity_valuations`, `equity_grants`, `vesting_events`, `equity_exercises`, `equity_sales`, `cap_table_exports`, `wps_files`, `eosb_provisions`, `contractor_tax_forms` (US TIN encrypted). Same rules as §5.1.

### 5.11 Dated and versioned tables

| Table | Why dated / versioned |
|---|---|
| `compensations` | Pay on a date; revisions and arrears (P06) |
| `employee_statutory` | PF / ESI status on a date; registers read the stored payslip values, not today's (YX-PAY-20) |
| `pay_group_members` | Which group paid the person in which period |
| `employee_payment_mode` | Cash / cheque only for approved periods |
| `entity_statutory_options` | Legal options change by date (P07 YX-STAT-06) |
| `salary_template_versions` | A payslip keeps the template version it used (YX-PAY-01) |
| `payslip_layouts` | A published payslip keeps its layout version (YX-PAY-35) |
| `bank_formats`, `statutory_rule_sets` (platform) | A file or figure uses the format / rule valid on its date |

### 5.12 Platform tables (no tenant key)

P07 says rule sets live in a platform `statutory` schema. Step 4 created `statutory_rule_sets` in `public` with a read-all policy and no app writes. **PAY-2.01 moves it into the `statutory` schema** and adds the P07 §5 tables: `packs`, `statutes`, `golden_cases`, `calendar_rules`, `law_crosswalk`, `advisories`. `bank_formats` joins them. The app role can only `SELECT`. The YukthiX console writes through a separate database role, with maker ≠ checker (P07 §4.3). The CI whitelist (YX-STAT-10) names this schema only.

---

## 6. Roles and permission keys

### 6.1 Roles

Roles are P02 role templates in `ROLE_TEMPLATES` (data, not code names, YX-SEC-02). A company can copy and edit them. The role risk check (YX-SEC-18) warns when one role can both prepare and approve.

| Role | Typical scope | Can | Cannot |
|---|---|---|---|
| **Payroll Admin** (exists, extended) | Legal entity | Set up payroll, compensation, inputs, run, calculate, review, submit, generate files, record payments, publish, statutory hub, verify proofs | Approve a run they prepared (when someone else can) |
| **Payroll Approver** (exists, extended) | Legal entity | Approve runs, bank file release, statutory payments, reopen (first step) | Prepare runs or inputs |
| **Finance Approver** (new template) | Legal entity | Approve runs (second level, Q2), journals, cost reports | See individual tax workspaces |
| **Compliance Owner** (new template) | Legal entity | Statutory hub, filings, registers, advisories, read payslip statutory values | Change pay |
| **Payroll Auditor** (new template, read only) | Legal entity | Read runs, payslips, registers, audit, "reproduce payslip" | Any write |
| **Employee** (implicit) | Self | Own payslips, tax workspace, declarations, proofs, queries, loans | Anyone else's pay |
| **Manager** (implicit) | Team | **Nothing about pay** unless the company turns on team salary view (P02 Q3) | — |
| **Consultant** (external login, P02 §4.7) | Own record | Own invoices, payments, advices, Form 131 | Anything else |
| **Alumni / Nominee** (external login) | Own documents | Read payslips, Form 130, letters (YX-DOC-16 / 19) | Anything else |

### 6.2 Permission keys

Same style as today (`employee.salary.view`). Every endpoint declares one (YX-SEC-01). Scope comes from the grant (legal entity, location or tenant). The keys marked ⚡ need step-up.

| Batch | Keys |
|---|---|
| 5a | `payroll.period.view`, `payroll.period.reopen` ⚡, `audit.view` (exists), `audit.export`, `payroll.document.issue` |
| 5b | `payroll.setup.manage`, `payroll.statutory.setup` ⚡ (registrations, deductor details), `payroll.component.manage`, `payroll.template.manage`, `employee.salary.view` (exists), `employee.salary.manage` (exists), `payroll.import.run` |
| 5c | `payroll.run.view`, `payroll.run.prepare`, `payroll.run.approve` ⚡, `payroll.input.manage`, `payroll.hold.manage`, `payroll.loan.manage`, `payroll.loan.approve`, `payroll.journal.export`, `payroll.cost_rate.view` |
| 5d | `payroll.bankfile.generate`, `payroll.bankfile.release` ⚡, `payroll.payment.record`, `payroll.payslip.publish` ⚡, `payroll.query.handle`, `payroll.payment_mode.approve` |
| 5e | `tax.workspace.view`, `tax.proof.verify`, `tax.regime.override` |
| 5f | `statutory.filing.view`, `statutory.filing.generate`, `statutory.filing.download` (audited), `statutory.filing.mark_filed` ⚡, `statutory.challan.manage`, `statutory.register.sign` ⚡, `statutory.advisory.review` |
| 5g | `payroll.offcycle.prepare`, `payroll.arrears.approve`, `payroll.fnf.manage`, `payroll.writeoff.approve` |
| 5h | `consultant.manage`, `consultant.invoice.approve` |
| 5i | `payroll.ewa.manage`, `payroll.equity.manage`, `payroll.special.manage` |

Implicit (no key, computed like P02 Employee @ self): see own payslips and tax workspace, declare, upload proofs, raise a payslip query, request a loan or advance.

**API keys** (P11, US-E-226): payroll and statutory writes need a key with the `payroll-write` scope. P03 approvals and maker ≠ checker still apply to API calls. Locked periods refuse API writes like any other write.

---

## 7. Salary structures and components

### 7.1 Components

- A company starts from the **India starter library** (P07 + D17 starter template): Basic, DA, HRA, Conveyance, Special allowance, LTA, Bonus, OT, Arrears, PF employee, PF employer (EPF / EPS / EDLI / admin), VPF, ESI employee / employer, PT, LWF employee / employer, TDS, Loan EMI, Advance recovery, Court attachment, EWA recovery, Gratuity provision, Bonus provision, and the info lines.
- **Statutory components are owned by the pack.** Their amounts come only from the evaluator (§8). A company can rename the label and choose payslip display, never the maths.
- **Wage flags decide the bases, never names** (YX-PAY-17). PF wage = sum of lines flagged `pf_wage`; same for ESI, PT, gratuity, bonus. The **Code wage** (YX-PAY-47) = lines flagged `code_wage_part` + the add-back when lines flagged `code_exclusion` exceed 50 % of total pay.
- A component code is fixed once a payslip uses it. A component used on any payslip cannot be deleted, only retired.

### 7.2 The formula language (safe, typed, no code)

Formulas are written as text, e.g. `round(min(basic * 0.12, 1800))`. Rules:

1. The text is parsed by `jsep` into a syntax tree. jsep only parses; it never runs anything.
2. Our **validator** walks the tree and allows only:
   - numbers;
   - `+ - * /`, comparisons (`< <= > >= == !=`), `and`, `or`, `not`, brackets;
   - **variables** from an allow-list: component codes in the same template, `ctc`, `monthly_ctc`, `payable_days`, `period_days`, `lop_days`, `worked_days`, `ot_hours_normal`, `ot_hours_weekoff`, `ot_hours_holiday`, `rate`, `age`, `service_years`, and employee fields from the P19 field registry (grade, employment type, location state, custom fields allowed as policy points, D19);
   - **functions** from an allow-list: `if(c, a, b)`, `min`, `max`, `round(x, step?)`, `floor`, `ceil`, `abs`, `prorate(x)` (uses the group's day basis), and the read-only statutory functions `pf_employee()`, `pf_employer()`, `esi_employee()`, `esi_employer()`, `pt()`, `lwf_employee()`, `gratuity_provision()`, `bonus_provision()`, `code_wage()`.
   - Anything else is refused: member access (`a.b`), indexes, strings, `this`, assignments, unknown names. The error says which word is not allowed, in plain English.
3. The validator also **type-checks** (money, number, days, yes / no) and sets limits: 500 characters, 200 nodes, depth 20.
4. The stored form is the checked tree (`jsonb`). The **evaluator** walks it with `Prisma.Decimal`. There is no `eval`, no `Function`, no template strings, no property lookups (same promise as P19 conditions).
5. The same module (`rules-engine/expressions.ts`) also serves the desk's formula fields, so P19 has one expression engine, not two.

### 7.3 Templates

- A template version is checked **on save** (YX-PAY-01):
  - dependency order is computed (topological sort);
  - a **cycle** is refused, naming the components in the loop;
  - a **test run on a sample employee** is required; the API returns the lines so the builder shows them;
  - if the sample produces a **Code wage add-back**, the save shows a flag (YX-PAY-47).
- Editing makes a **new version**. Past payslips keep the version they used.
- **Proration** (YX-PAY-02): a component's own proration formula when it has one; else `amount × payable days ÷ period days` with the group's day basis. The engine marks each line "prorated" so it never prorates twice.

### 7.4 CTC breakup (Q1)

- **CTC-first:** HR enters annual CTC. The template computes every line. One line is the **balancing component** (usually Special allowance) = CTC − all other lines − employer costs inside CTC.
- Employer PF, ESI and gratuity can sit **inside CTC** (template option). Then the balancing line depends on employer ESI, which depends on gross, which depends on the balancing line. The solver handles this by **bounded iteration** (at most 20 rounds, until the change is under one paisa). It then checks the ESI threshold both ways and keeps the consistent answer. If there is no stable answer, the save fails with a plain message.
- **Fixed-amount entry:** HR enters the monthly amounts; the template only adds the statutory lines. Both modes write the same `compensations` + `compensation_lines` rows.
- The breakup is shown with a **minimum-wage and floor-wage check** (YX-PAY-22) and, where relevant, the Code wage add-back.

### 7.5 Compensation and revisions

- A new or revised compensation is a **P06 employee change** of type `compensation`, approved through **P03** (request type `payroll.compensation`), with a revision letter from P05 (YX-WF-01). The change engine writes the dated `compensations` row; it never edits an old row.
- Pay basis can be monthly CTC, fixed, or an **hourly / daily rate** with OT and holiday multipliers (from the M10 rate card for placements, YX-PAY-24).
- **Retro tiers** (YX-HIS-12): within the open period → normal approval; reaching a processed period → correction request with a Payroll Admin step; before the retro limit → System Admin override with reason.

### 7.6 Mid-period changes and arrears

- **Mid-period method** per change type (and optionally per component), set in Settings (YX-HIS-13): segments (default), whole-month cut-off day N, or next month + arrears. **Statutory items always use the legal basis** whatever the method (PF / ESI ceilings per segment, PT per state rule).
- The engine asks P06 `segments()` for the period and makes one line per component per segment (YX-PAY-03).
- **Arrears** for a back-dated revision: per month, per component, **corrected − as-paid** (from payslips, or from imported as-paid lines before go-live). Statutory on arrears follows P07 (PF / ESI to the wage month where the rule says so, YX-PAY-33). The arrears appear in the next run as named lines with the months they belong to.

---

## 8. Statutory engine as data (P07)

### 8.1 Rule store

- `statutory.rule_sets`: statute, jurisdiction (`IN`, `IN-KA`, zone), `valid_from`, `valid_to`, version, status (`draft`, `in_review`, `published`, `withdrawn`), `law_version` (`OLD-ACT` / `CODE` for labour statutes, `IT-1961` / `IT-2025` for TDS), `transitional`, `verify`, typed payload, source and stored copy, drafted by, reviewed by, published at.
- **Shapes** (P07 Q3): *rate* (percent, ceiling, rounding), *slab* (range → amount, with conditions: gender, month, age band, disability, half-year), *list* (sections, cities, categories with limits), *calendar* (due rules), *coverage* (threshold, headcount basis, sticky).
- Each shape has a **schema check** on publish: slabs contiguous and not overlapping, PT annual total ≤ ₹2,500, rates 0–100 %, dates valid. Publishing also runs the statute's **golden cases** (YX-STAT-04).
- Published versions are never edited. A fix is a new version (YX-STAT-02).

### 8.2 Evaluator and calculators

- `statutory/evaluator.ts`: `rate()`, `slab()`, `list()`, `due()`, `coverage()` over the rule set **valid on the period date**. It returns the amount **and** a citation `{statute, jurisdiction, version, verify}`. Every payslip line stores that citation (YX-STAT-05).
- **Calculators** for logic too complex for tables, each a versioned pure function pinned to golden cases:
  - `tds.<tax-year>` (slabs by regime and age, standard deduction, rebate and marginal relief, surcharge and its relief, cess, exemptions, 206AA, non-resident rules);
  - `pf` (EPF / EPS / EDLI split, ceiling, pre-2014 and higher-pension options, age 58 stop, international worker);
  - `esi` (contribution period, coverage continuation, round up, daily-wage exemption, PwD ceiling);
  - `gratuity` (15/26 × wage × years, 6-month round-up, cap, fixed-term pro-rata, death / disablement waiver);
  - `bonus` (eligibility wage, calculation ceiling, 8.33–20 %, set-on / set-off);
  - `code_wage` (50 % add-back);
  - `ec` (employees' compensation, J6).
- **No India code outside the pack.** Modules call `evaluate(statute, …)`; the CI scan for country constants (US-E-347) fails on hard-coded rates, slabs or dates.

### 8.3 What each statute does in the run

| Statute | Base | Key logic | Output lines | Rule |
|---|---|---|---|---|
| **PF** (`IN.PF`) | PF wage from flags (Code wage from 21 Nov 2025) | Ceiling per segment unless the entity option "PF on actual wage" is on; employee 12 %; employer EPF + EPS (EPS capped, none after 58 or for pre-2014 non-members as the rule says) + EDLI + admin charges with minimums; VPF on top; international worker on actual wage; arrears to the wage month | PF employee, VPF, EPF employer, EPS, EDLI, admin; NCP days for ECR | YX-PAY-17, YX-PAY-33 |
| **ESI** (`IN.ESI`) | ESI wage from flags | Coverage tested at the start of each contribution period (Apr–Sep, Oct–Mar) and kept until the period ends; ceiling ₹21,000 or the PwD ceiling with consent; employee and employer rates; **round up** to the next rupee; daily-wage exemption; arrears on the month paid | ESI employee, ESI employer | YX-PAY-18, YX-PAY-56 |
| **PT** (`IN.PT`) | PT wage from flags | Work-location state on the deduction date; state slabs, gender and month exceptions (e.g. February), frequency; annual cap ₹2,500; **one liable state per slot** on a state change | PT | YX-PAY-19, YX-PAY-54 |
| **LWF** (`IN.LWF`) | Per state rule | Deduction months, fixed amounts or %, caps, employer share | LWF employee, LWF employer | YX-PAY-19 |
| **Minimum wage** (`IN.MW`, `IN.WAGES-CODE`) | Wage per the state rule | max(state rate for zone × skill category, national floor wage) | Pre-run warning; piece-rate top-up (5i) | YX-PAY-22 |
| **Code wage** (`IN.WAGES-CODE`) | Flags | Add back exclusions above 50 % of total pay; base for PF, ESI, gratuity, bonus, leave encashment; straddling period split by days | Info line + bases | YX-PAY-47 |
| **Gratuity** (`IN.GRATUITY`, `IN.SS-CODE`) | Gratuity wage (Code wage) | Monthly provision; payment on exit by eligibility | Provision (employer); F&F line | YX-PAY-15 |
| **Bonus** (`IN.BONUS`) | Bonus wage | Eligibility and calculation ceilings, % within 8.33–20 %; monthly provision or monthly payment per entity | Provision or bonus line | YX-PAY-16 |
| **TDS** (`IN.TDS`) | Taxable income projection | §8.5 | TDS | YX-TAX-01…21 |
| **Deduction cap** (`IN.WAGES`) | Wages | Total deductions ≤ cap (e.g. 50 %, 75 % with co-op dues); lower-priority deductions deferred | Deferrals | YX-PAY-32 |

### 8.4 Order of deductions (fixed by law, then company)

1. Statutory: PF, ESI, PT, LWF, TDS (computed on accrued pay even when net is held, YX-PAY-28).
2. Court attachments, by order date (YX-PAY-32).
3. EWA recovery (5i, YX-PAY-41).
4. Loan EMIs, advance instalments, carry-forward recoveries, in their schedule order (YX-PAY-11).
5. Others (union dues with authorisation, 5i).

Steps 2–5 stop at the **protected net** (company setting) and at the **legal deduction cap**. What does not fit is **deferred** and raises `recovery.deferred`. A negative net becomes zero plus a carry-forward balance (YX-PAY-29).

### 8.5 TDS on salary

- **Regime:** new regime by default. The employee picks in the tax workspace until the company's cut-off; after it, only HR with a reason (YX-TAX-01).
- **Monthly TDS** = (projected annual tax − tax already deducted) ÷ remaining pay periods (YX-TAX-02). The projection includes past actuals, this payslip, future months at current pay, approved one-time pay, Form 12B income and other income.
- **Before proof cut-off:** declarations count. **After:** only verified proof amounts, and extra tax is spread over the remaining periods (YX-TAX-03).
- **HRA** month by month over months of employment and rent; landlord PAN above the P07 threshold (YX-TAX-04).
- **No / inoperative PAN:** never a block; higher of 20 % or slab rate; no-PAN flag on the return row. PAN operative status is checked through the P10 partner before each run and each filing (YX-TAX-10).
- **One function** computes both the tax sheet the employee sees and the TDS deducted (YX-TAX-06). The tax sheet is the projection row, not a second calculation.
- **Law version** on every computation, challan, return and certificate (YX-TAX-19): `IT-1961` for periods up to 31 Mar 2026 (24Q, Form 16), `IT-2025` from 1 Apr 2026 (Form 138, Form 130). Section labels come only from the reviewed cross-walk (YX-STAT-24).

### 8.6 Declarations, proofs and Form 12BB

- **Declaration window** at the tax-year start and on joining; **proof window** Jan–Feb (company dates); P04 reminders before each deadline (Q5).
- Declaration lines use **P07 subject keys** (80C, 80D, HRA, home-loan interest…), shown with the section label for the law version. The declaration renders as **Form 12BB** for periods up to 31 Mar 2026, and as its successor form from tax year 2026-27 (APX-F #76 / #108; "verify number" stays until the compliance owner fills it).
- Proofs are verified **line by line**: approve, reject or partly approve, with a comment. The verifier can never be the employee (YX-TAX-05).

### 8.7 The verify flag

- A rule set published with `verify = true` (P07 YX-STAT-13) is used, but every line it produces carries `verify = true`.
- The run's review tab shows "**N figures use rules marked verify**" with the list. The statutory hub and Settings › Statutory rules show the same badge. It is never hidden and never blocks on its own.
- Labour Code rules (in force 21 Nov 2025) never carry the flag (YX-STAT-20).
- **Go-live gate (proposed, §19 D2):** before the pilot, the compliance owner and the partner CA clear the verify flag for PF, ESI, PT, LWF, minimum wage and TDS in the pilot states.

### 8.8 Legal options per entity

Only what the law leaves to the employer (P07 §4.4), dated in `entity_statutory_options`: PF on actual wage or ceiling; employer share basis; PT / LWF registrations; bonus % and payment method (Q8); gratuity provisioning method. **No rate overrides** (YX-STAT-06).

---

## 9. Run engine

### 9.1 Create and readiness

- A regular run is created per pay group and period (by hand or by the scheduler at period start). Off-cycle runs are created by hand, or automatically for F&F (§9.9).
- The **readiness screen** shows, per group: attendance mode (Punch block / Punch warn / Assumed present / Timesheet, D1), feed status from M02, manual LOP status, pending one-time pay, pending approvals, joiners / leavers, coverage thresholds crossed (YX-PAY-53), transfer continuity items (US-A-157), and open validations.

### 9.2 Freeze

When the Payroll Admin clicks **Calculate** (or the cut-off passes), the period moves to `frozen`. The **attendance feed** for the period is copied into `attendance_feed` with its version. From then on the run reads only the copies and the snapshots, so later edits cannot change it silently (YX-PAY-07).

### 9.3 Pre-run validation (YX-PAY-05)

| Check | Severity |
|---|---|
| Bank details missing or not verified (P05 Q7) | block (waivable: payslip held instead) |
| PAN missing / not verified / inoperative | **warn only** (TDS follows 206AA) |
| UAN or ESI IP number missing for PF / ESI-eligible employees (E11) | warn |
| No compensation | block for that employee |
| Open attendance exceptions (Punch groups with block on) | blocks **approval**, not calculation; cannot be waived (YX-LOCK-08) |
| Pay below minimum wage or floor wage (YX-PAY-22) | warn |
| Code wage add-back (YX-PAY-47) | info to acknowledge |
| Coverage threshold crossed and statute not on (YX-PAY-53) | blocks approval |
| LOP days > calendar days; pay before joining or after LWD; approved leave missing from the feed; net change over threshold with no input change; same bank account on two employees (G9) | block (waivable with reason) |
| Pending one-time pay or loan approvals | warn |

Waivers need a reason and are audited.

### 9.4 Calculate (fan-out)

1. The run takes a **PostgreSQL advisory lock** on its id, so two calculations of one run never overlap.
2. It builds the employee list and queues **BullMQ jobs** of 200 employees each on the `payroll-calc` queue. Job ids are `run:calcVersion:chunk`, so a retried job is idempotent.
3. Each job, per employee: build the snapshot → call `calculatePayslip()` → write payslip, lines and snapshot **in one transaction** → mark `run_employees.state`.
4. A failure stores the employee, record and field, with a Fix link (YX-PAY-34). Other employees go on.
5. The run moves to `calculated` only when every included employee is `ok`. Progress is streamed to the run workspace (polling every 2 s; no new socket needed).
6. **Recalculate** before approval makes a new calc version and replaces the draft payslips of that version only.

**Inside `calculatePayslip()`**, in this order:
1. segments from the snapshot (P06);
2. per segment: earnings from the template (formulas, proration once), rate-based pay, one-time pay, arrears;
3. wage bases from flags, Code wage add-back;
4. statutory: PF, ESI, PT, LWF, gratuity and bonus provisions (§8.3);
5. TDS from the projection (§8.5);
6. recoveries in legal order within protected net and cap (§8.4);
7. net, rounding (company rule for net pay), employer cost;
8. explanations for every line.

### 9.5 Review

- **Variance:** each payslip is compared with the previous approved one. Net change above the threshold (default ±10 %) or a new / removed component must be acknowledged (YX-PAY-06).
- **Exception filter** in the run workspace; **"why this number"** drawer from the stored explanation (YX-PAY-12).
- **Holds** can be added or released per employee (YX-PAY-28).

### 9.6 Approve and lock

- **Submit** creates a P03 request of type `payroll.run` (risk: high, no auto-actions). The default chain has two levels (Q2); a company can add levels or amount conditions (P19 condition on run totals), or use one.
- **Maker ≠ checker** (YX-SEC-12): the preparer and anyone who changed inputs in this calc version are removed from the approver list when another eligible approver exists. With only one eligible person: self-approval with a reason, and the System Admin / owner is notified (P02 Q6, US-A-154).
- Every approval needs **step-up** (YX-IAM-02) and the **irreversible-action dialog** (YX-AUD-09: typed confirmation, people count, net total).
- Approval is **blocked** while attendance exceptions are open (block groups) or a crossed coverage threshold is not handled.
- On the final approval, **in one transaction**: run → `approved`; payslips → immutable; period → `locked`; attendance and pay-affecting leave for the period locked (YX-LOCK-04); `payroll.run.approved` and `period.locked` events.

### 9.7 Pay

- **Bank file** (§11.2) for approved, unwithheld, verified-account, bank-mode payslips. **Release** is a separate step: maker ≠ checker, step-up, irreversible-action dialog (YX-INT-03).
- **Cash / cheque** payslips go to the disbursement register (YX-PAY-31).
- **Payment status** is recorded per payslip: upload of the bank's response file, or manual marking with reason. When all are settled, the run → `paid` and `payroll.run.paid` fires.
- **Failure flow** (D11): failed / returned → employee told in the app (+ SMS without amounts) → expedited bank change (checker + penny-drop) → optional payment to the verified reimbursement account → included in the next bank file or an off-cycle payment.

### 9.8 Publish and post

- **Publish** (step-up, dialog): payslips become visible in the employee's app; a notice with an in-app link only (P04 Q6). The PDF renders from the entity's payslip layout (YX-PAY-35); download is a short-lived signed link with a name / time watermark.
- **Journal:** ledger lines by entity and cost centre from the accounting mapping; export to Tally (voucher file), Zoho Books (API) or CSV; `payroll.journal.ready` for the Accounting API (P10 Q7). Per-employee lines only for keys allowed salary-level data.

### 9.9 Off-cycle runs and F&F

- Off-cycle runs use the **same engine, approval and lock rules** but never count as the regular payslip (YX-PAY-04). Each has its own bank file.
- **F&F:** on the approved LWD, an F&F off-cycle run is **created automatically** with a deadline of **2 working days** from the entity's holiday calendar (YX-PAY-48). It pulls: pay to LWD, leave encashment or recovery, notice shortfall, gratuity, bonus due, loans and carry-forwards, holds, retrenchment lines (YX-PAY-49), death-in-service payees (YX-PAY-27). If something blocks, the undisputed wages are paid on time and the rest goes in a second F&F run with the reason.

---

## 10. Inputs

### 10.1 From M02 (attendance and time)

The **payroll feed contract** (M02 §B6), read per employee per period after the freeze:

| Field | Used for |
|---|---|
| Payable days, LOP days, half days (with P06 segments) | Proration, LOP |
| Approved OT hours by category (normal / weekly off / holiday) | OT lines |
| Shift / night allowance days | Allowance lines |
| Comp-off credits, leave encashment drafts | Encashment lines, F&F |
| Timesheet hours by placement × category | Rate-based pay (YX-PAY-24) |
| Injury leave days, maternity days | YX-PAY-50, YX-PAY-26 |
| Open attendance exceptions count | Approval block (YX-LOCK-08) |

- **Assumed-present groups:** M02 sends expected working days − approved LWP; HR enters LOP by hand or by CSV / XLSX with row checks and a reason per row (D1).
- The time module exposes one read function, `payrollFeed(org, legalEntity, from, to)`, so payroll never reads time tables directly.

### 10.2 One-time pay

One table, named sources (M03 §3): manual, M05 claims and advance instalments (later), M06 comp-review and bonus split, M09 rewards, M10 referral / joining bonus / placement commission, M08 subsistence allowance, M01 ex-gratia, loans, arrears. A **recurring** item has a start and an end; the last partial month is paid prorated (fixes C-D9). Manual items above a company threshold go through P03 (`payroll.one_time`).

### 10.3 Reimbursements (M05, later)

Until M05 is built, reimbursements are manual one-time pay with the taxable / exempt category from P07. When M05 lands, approved claims arrive as one-time pay with `source = m05`, and `payroll.run.paid` / `.voided` move them to paid / back to approved (APX-B).

### 10.4 Loans and salary advances (Q4)

- Requests through P03 (`payroll.loan`) with company limits (max amount, EMIs, eligibility) from Settings.
- EMI schedule stored on the loan; each run takes the due EMI within protected net and cap (§8.4).
- Interest-free or concessional loans add a **perquisite** at the P07 benchmark rate (small-loan exemption per rule) into the TDS projection.
- Pause, pre-close and reschedule by HR with a reason (audited). Outstanding balance goes to F&F.

### 10.5 F&F inputs (from M01)

Exit type, LWD, notice served / shortfall, recoveries from exit clearance, nominees and shares, assets not returned (as recovery items). They arrive with the M01 exit approval; the F&F run reads them like any other input.

---

## 11. Outputs

### 11.1 Payslip

- Rendered from the stored lines (YX-PAY-12) through the P05 pipeline with the entity's **payslip layout** (APX-F #27 / §3.1).
- **Locked mandatory content** (YX-DOC-22): the wage-slip particulars that P07 requires for the employee's state and establishment type. The editor shows them with a lock and cannot hide them. A layout cannot be activated if one is missing.
- Masked identifiers only (PAN, bank account last 4). Languages per L4 with embedded fonts (YX-DOC-14).

### 11.2 Bank files

- **Format registry as data** (`bank_formats`, platform table): columns, order, widths, header / trailer, date and amount formats, file type. Launch set per P10 Q5: generic NEFT / RTGS + HDFC, ICICI, SBI, Axis, Kotak. Order of building: §19 D1.
- Account numbers and IFSC are written **as text** (leading zeros kept; XLSX cells typed as text) (YX-PAY-13).
- Includes only approved, unwithheld, verified-account, bank-mode payslips (plus approved consultant invoices, YX-PAY-38).
- **Integrity:** the file is an `exchange_files` row with a SHA-256 hash, row count and total. Before release the server re-reads the stored file and checks hash, count and total against the run. Generated once per run; regeneration needs a reason and supersedes the earlier file.
- **Release:** maker ≠ checker, step-up, irreversible-action dialog. The file is encrypted at rest and downloaded through a single-use signed link. Payout API (add-on, P10 Q5) later uses the same release step.

### 11.3 Payslip and pay reports

APX-C RPT-PAY-01…20 come from the stored lines and the P09 report layer. Exports follow §12.5.

### 11.4 PF, ESI, PT, LWF files and challans

| Output | Content source | Notes |
|---|---|---|
| **PF ECR** (text, P07 format) | Statutory values **stored on the payslip** (YX-PAY-20), UAN decrypted at generation | ELI fields (R5), NCP days, arrear rows; IW-1 for international workers |
| **ESI monthly contribution** (portal Excel) | Same | IP number, days, wages, contribution |
| **PT return** per state | Same, state used per employee shown (YX-PAY-54) | One row per employee per slot |
| **LWF return** per state | Same | Employee + employer share |
| **Supplementary ECR / ESI past-period** (J20) | Arrears lines and corrections | Linked to the original filing; interest / damages lines |

Each filing moves **generate → download (audited) → mark uploaded with TRRN / challan no. → filed** (or partner path: generate → transmit → filed by partner → acknowledgement synced). A filed filing locks the period as `filed`. Before filing, regenerate needs a reason; after filing, only a supplementary filing (YX-PAY-21 / 51).

### 11.5 TDS: challans, returns, certificates

- **Challan** per deposit month and section, pre-filled from approved runs and paid consultant invoices, with s.201(1A) interest and s.234E fee from P07 (YX-TAX-14).
- **Quarterly return** (Form 138, or 24Q for quarters up to 31 Mar 2026): deductee rows from approved payslips incl. leavers and prior-month rows for mid-year starters (YX-TAX-15); deductor details from registrations (YX-PAY-36); **deposit-vs-deduction reconciliation** must be zero difference (RPT-STAT-01); then **FVU** in the worker.
- **Self-file:** HR uploads the FVU output on the portal, records the token number; Form 130 Part A is imported from the TRACES bulk download (HR uploads the ZIP; we parse and match by PAN). **Partner:** an adapter per partner (§19 D3) transmits, polls status, fetches acknowledgement and Part A.
- **Form 130** (Form 16 for 2025-26 and earlier) at year end: Part A + Part B (ours), DSC-signed (§19 D4), published to employees and alumni. **Correction return** accepted → revised Form 130 / 131, earlier one superseded, notice + correction statement (YX-TAX-20).

### 11.6 Registers and inspection pack

When the period locks, the registers required by `IN.REGISTERS` for each location are generated in the format valid on the period date, from stored payslip values and attendance (accidents register from closed M08 cases), **frozen**, **DSC-signed** and kept for the retention period. A correction makes a **new signed version** with a reason; the old one is kept as superseded. The inspection pack bundles the latest signed versions with a cover sheet (YX-PAY-39). An employee sees only their own row in any register (YX-SEC-16).

### 11.7 Accounting journal

§9.8. Tally voucher XML, Zoho Books API, CSV, Accounting API with `payroll.journal.ready` and a "mark posted" callback (P10 Q7). Gratuity and bonus provisions and the actuary's figures (5i) post as journals too.

---

## 12. Security

### 12.1 Who sees pay

| Who | Sees | How it is enforced |
|---|---|---|
| Employee | Own payslips, tax workspace, loans, queries; own row in registers | RLS pay guard (own employee ids) + API |
| Payroll Admin / Approver / Auditor | Pay of employees in their granted entities (and narrower scope if granted narrower) | RLS pay guard (`app_pay_entities()`) + P02 scope in the app |
| Compliance Owner | Statutory values and filings; payslip totals, not tax workspaces | Key-level |
| Finance | Run totals, journals, cost reports; per-employee only if granted | Key-level + field classes |
| Manager | **Nothing** unless team salary view is on (P02 Q3) | Key not granted by default |
| HR Admin (no payroll key) | Not pay | Key-level + RLS |
| Company System Admin | Not pay by role alone; must hold a payroll key in scope | RLS has no admin escape |
| YukthiX staff, super-admin, support session | **Never** | `support_session_excluded` + no super-admin escape in the pay guard |
| Consultant / Alumni / Nominee | Own documents only | External login + `app_portal_person()` |

Viewing someone else's pay is an audited read (YX-SEC-09), de-duplicated per viewer × subject within 30 minutes (YX-AUD-04).

### 12.2 Maker ≠ checker (YX-SEC-12)

Applies to: run approval, bank file release, statutory payment / challan, reopen, compensation changes, loans, one-time pay above threshold, write-offs, consultant invoices, bank and PAN changes, arrears approval. Built once in P03 (US-C-006): the maker is removed from the approver set when another eligible approver exists; with one eligible person, self-approval with a reason notifies the System Admin / owner. The role risk check warns when a role can both prepare and approve (YX-SEC-18).

### 12.3 Step-up (YX-IAM-02)

Asked (AAL2 within the last 15 minutes) for: approve run, reopen, release bank file, publish payslips, mark a filing filed, sign registers / issue Form 130, change statutory registrations or deductor details, expedited bank fix, change payroll approval chains. The step-up is recorded on the audit row.

### 12.4 Audit and locks

- Every pay write writes an audit row **in the same transaction** (YX-AUD-01). Audit rows are append-only at the database level and hash-chained per tenant; a daily job verifies the chain (YX-AUD-02 / 03).
- Irreversible actions store what the user confirmed (YX-AUD-09).
- Every file download (bank, ECR, returns, registers) is audited with file hash (YX-PAY-21, YX-INT-03).
- Period locks are checked in the database, not only in code (§3.3).

### 12.5 Masking in exports and reports

- Exports apply P02 field classes server-side (YX-SEC-07). Identifiers are masked (last 4) unless the viewer holds the identifier key **and** the export type needs them (statutory and bank files only).
- Small groups (< tenant threshold, default 5) are suppressed in pay breakdowns for viewers without individual access (YX-SEC-14).
- Exports are audited (YX-MET-09). Report emails carry a link, never the data (P04 Q6).
- Payslip email (company option, default off): AES-256 password-protected PDF, no amounts in the email, only to verified addresses (YX-NTF-15).

### 12.6 Other protections

- **Bank-change cooling** (P02 §4.5) before a new account is used in a bank file; the D11 exception needs a checker and a penny-drop.
- **Duplicate bank account** across employees blocks the run (G9).
- **Rate limits** on payslip downloads and tax endpoints per user.
- **FVU worker** has no network and runs as a non-root user with a read-only file system; it receives only the return file.
- **Pen test before the pilot** (go-live checklist #10).

---

## 13. Events and notifications

**Events** (APX-B §2.12; payload "thin": ids, counts, never amounts):
`payroll.cutoff.approaching`, `payroll.run.calculated`, `payroll.run.submitted`, `payroll.run.approved`, `period.locked`, `payroll.run.paid`, `payroll.run.voided`, `payslip.published`, `payment.failed`, `payroll.hold.applied`, `payroll.hold.released`, `recovery.deferred`, `payroll.carry_forward.created`, `payslip.query.raised`, `payroll.journal.ready`, `tax.proof.submitted`, `tax.proof.verified`, `statutory.filing.filed`, `statutory.filing.rejected`, `statutory.filing.supplementary.created`, `statutory.excess_request.raised` / `.settled`, `statutory.arrears.proposed`, `statutory.coverage.approaching` / `.crossed`, `tax.certificate.revised`, `fnf.due`, `fnf.overdue`, `loan.closed`.

M03 does **not** emit `statutory.filing.due` (retired). Due dates come only from the P04 scheduler SCH-07 over the P07 compliance calendar.

**Notifications** (APX-A; all in-app with a link; email / SMS / push carry no amounts, P04 Q6):

| To | When |
|---|---|
| Payroll Admin | Cut-off near; calculation done / failed; run rejected; payment failed; proof submitted; supplementary filing needed; coverage crossed; rule change published / effective soon; F&F due / overdue |
| Approvers | Run waiting for approval (P03 task); bank file waiting for release |
| Employee | Payslip published; payment failed (fix bank details); hold released; recovery deferred; declaration / proof window open and closing; proof verified; regime cut-off near; revised Form 130; PAN inoperative |
| Finance | Journal ready |
| Compliance Owner | Filing due (SCH-07); filing rejected; advisory published |

---

## 14. API endpoints

All under `/api/v1/payroll` (tax under `/api/v1/tax`, filings under `/api/v1/statutory`). P11 rules: tenant from session (YX-API-03), cursor lists with `fields=` (YX-API-06), `Idempotency-Key` on writes (YX-API-05), RFC 9457 errors naming employee, record and field (YX-API-07), OpenAPI generated in CI (YX-API-04). ⚡ = step-up.

### 14.1 Batch 5a

| Method and path | Purpose | Key |
|---|---|---|
| `GET /periods?payGroupId=` | Periods with stage | `payroll.period.view` |
| `POST /periods/{id}/reopen-requests` ⚡ | Ask to reopen (P03) | `payroll.period.reopen` |
| `GET /audit`, `GET /audit/export` | Audit search, audited export | `audit.view`, `audit.export` |
| `GET /files/{id}/download` | Single-use signed link to an exchange file (audited) | per file kind |

### 14.2 Batch 5b

| Method and path | Purpose | Key |
|---|---|---|
| `GET/PUT /entities/{id}/statutory-registrations` ⚡ | Registrations, deductor details, completeness | `payroll.statutory.setup` |
| `GET/PUT /entities/{id}/legal-options` | Dated legal options | `payroll.statutory.setup` |
| `GET /statutory/rules?entityId=` | Read-only rule browser with history, sources, verify flags | `payroll.setup.manage` |
| `GET/POST/PATCH /pay-groups`, `/pay-groups/{id}/members` | Pay groups and membership | `payroll.setup.manage` |
| `GET/POST/PATCH /components` | Component library | `payroll.component.manage` |
| `GET/POST /templates`, `POST /templates/{id}/versions`, `POST /templates/validate` | Templates; validate + sample run | `payroll.template.manage` |
| `POST /formulas/check` | Parse and type-check one formula (builder autocomplete) | `payroll.template.manage` |
| `POST /compensations/preview` | CTC breakup + minimum wage + Code wage check | `employee.salary.manage` |
| `POST /employees/{id}/compensation-changes` | New / revised compensation (P06 change + P03) | `employee.salary.manage` |
| `GET /employees/{id}/compensation?asOn=` | Dated package and breakup | `employee.salary.view` (self implicit) |
| `GET/PUT /employees/{id}/statutory-profile` | Dated statutory profile | `employee.salary.manage` |
| `POST /imports/opening-balances`, `/imports/as-paid-lines`, `/imports/form12b` | Through the P15 staging pipeline | `payroll.import.run` |
| `GET/PUT /entities/{id}/payslip-layout`, `POST …/preview` | Layout editor and real render preview | `payroll.setup.manage` |
| `GET /coverage` | Coverage monitor | `payroll.setup.manage` |

### 14.3 Batch 5c

| Method and path | Purpose | Key |
|---|---|---|
| `POST /runs`, `GET /runs`, `GET /runs/{id}` | Create, list, read | `payroll.run.prepare` / `payroll.run.view` |
| `GET /runs/{id}/readiness`, `POST /runs/{id}/validations/{vid}/waive` | Readiness and waivers | `payroll.run.prepare` |
| `GET/PUT /runs/{id}/lop-inputs`, `POST …/lop-inputs/upload` | Manual LOP (D1) | `payroll.input.manage` |
| `GET/POST/PATCH /one-time-pays` | One-time pay | `payroll.input.manage` |
| `POST /runs/{id}/calculate`, `GET /runs/{id}/progress` | Fan-out; per-employee progress | `payroll.run.prepare` |
| `GET /runs/{id}/payslips`, `GET /payslips/{id}` (lines + explanations) | Review | `payroll.run.view` (self implicit for own published) |
| `GET /runs/{id}/variances`, `POST …/variances/{vid}/ack` | Variance review | `payroll.run.prepare` |
| `POST /runs/{id}/submit` | Open the P03 request | `payroll.run.prepare` |
| `POST /runs/{id}/approve` ⚡ (through P03 task decide) | Approve and lock | `payroll.run.approve` |
| `POST /runs/{id}/void` | Void before approval | `payroll.run.prepare` |
| `POST /payslips/{id}/reproduce` | Re-run from snapshot, compare hash | `payroll.run.view` (auditor) |
| `GET/POST /holds`, `POST /holds/{id}/release` | Holds (idempotent release) | `payroll.hold.manage` |
| `GET/POST /loans`, `POST /loans/{id}/schedule-changes` | Loans and advances | `payroll.loan.manage` (request: implicit self) |
| `GET/POST /court-orders` | Court orders | `payroll.input.manage` |
| `GET /runs/{id}/journal`, `POST …/journal/export` | Journal | `payroll.journal.export` |
| `GET /cost-rates` | Cost rates (Restricted) | `payroll.cost_rate.view` |

### 14.4 Batch 5d

| Method and path | Purpose | Key |
|---|---|---|
| `POST /runs/{id}/bank-files` | Generate (reason on regenerate) | `payroll.bankfile.generate` |
| `POST /bank-files/{id}/release` ⚡ | Release (maker ≠ checker) | `payroll.bankfile.release` |
| `POST /runs/{id}/payment-results` (file or rows) | Record paid / failed / returned | `payroll.payment.record` |
| `GET/POST /payment-modes` | Cash / cheque per employee (P03) | `payroll.payment_mode.approve` |
| `POST /runs/{id}/publish` ⚡ | Publish payslips | `payroll.payslip.publish` |
| `GET /me/payslips`, `GET /me/payslips/{id}/pdf` | Employee view, signed PDF link | implicit |
| `POST /me/payslips/{id}/queries`, `GET/PATCH /queries` | Payslip queries | implicit / `payroll.query.handle` |

### 14.5 Batch 5e

| Method and path | Purpose | Key |
|---|---|---|
| `GET/PATCH /tax/me/workspace` | Regime, residential status, other income | implicit |
| `POST /tax/me/regime-compare` | Old vs new for my figures | implicit |
| `GET/POST /tax/me/declarations`, `POST /tax/me/proofs` | Declarations, proofs with upload | implicit |
| `GET /tax/proofs?status=`, `POST /tax/proofs/{id}/lines/{lid}/decision` | Verification queue | `tax.proof.verify` |
| `POST /tax/workspaces/{id}/regime` | HR change after cut-off with reason | `tax.regime.override` |
| `GET /tax/me/tax-sheet` | Same numbers as TDS deducted | implicit |

### 14.6 Batch 5f

| Method and path | Purpose | Key |
|---|---|---|
| `GET /statutory/hub?entityId=&period=` | Cards per statute × month with due dates and penalty estimate | `statutory.filing.view` |
| `POST /statutory/filings` (statute, period, kind) | Generate ECR / ESI / PT / LWF / supplementary | `statutory.filing.generate` |
| `POST /statutory/filings/{id}/uploaded`, `/filed` ⚡ | Record upload, acknowledgement, filed lock | `statutory.filing.mark_filed` |
| `POST /statutory/filings/{id}/transmit` | Partner path | `statutory.filing.generate` |
| `GET/POST/PATCH /statutory/challans` | Pre-filled challans; edit with reason | `statutory.challan.manage` |
| `POST /statutory/tds-returns`, `POST …/{id}/reconcile`, `POST …/{id}/fvu` | Draft, reconcile, validate | `statutory.filing.generate` |
| `POST /statutory/tds-returns/{id}/part-a` (TRACES ZIP) | Import Part A | `statutory.filing.generate` |
| `POST /statutory/form130/batch` ⚡ | Generate, sign, publish | `statutory.register.sign` |
| `GET /statutory/registers`, `POST …/{id}/sign` ⚡, `POST /statutory/inspection-packs` | Registers and packs | `statutory.filing.view` / `statutory.register.sign` |
| `GET /statutory/advisories`, `POST …/{code}/review` | Advisory feed | `statutory.advisory.review` |

### 14.7 Batches 5g–5i

| Method and path | Purpose | Key |
|---|---|---|
| `POST /runs` with `type=offcycle` | Off-cycle | `payroll.offcycle.prepare` |
| `GET/POST /arrears-worksheets`, `POST …/{id}/confirm-base` | Arrears and base confirmation | `payroll.arrears.approve` |
| `GET /statutory/arrears-proposals`, `POST …/{id}/accept`, `/dismiss` | P07 Q4 proposals | `payroll.arrears.approve` |
| `GET /fnf`, `GET/PATCH /fnf/{id}` | F&F settlements and payees | `payroll.fnf.manage` |
| `GET/POST /consultants`, `POST /consultants/{id}/invoices`, `GET /consultant/me/*` | Consultants and portal | `consultant.manage` / Consultant login |
| 5i endpoints | One group per slice (EWA, piece-rate, incentives, tips, on-call, union, ESOP, country packs) | 5i keys |

---

## 15. Screens

Existing prototype screens in `packages/yx-ui` are wired to the API. New screens are marked **new** and get prototype stories before their slice is wired. Every wired screen passes `packages/yx-ui/review/PAY-CHECKLIST.md` once (review in one go).

| Batch | Screen | Prototype today |
|---|---|---|
| 5a | Audit log and record timeline | existing audit screen (`audit/`), extended |
| 5a | Irreversible-action dialog | APX-D §6.4 dialog in the kit |
| 5b | Payroll set-up wizard | **PAY-16** |
| 5b | Statutory set-up (registrations, legal options, filing and deductor) | **CMP-02**; Settings › Payroll & Statutory (Group 4) |
| 5b | Statutory rules browser and updates | **CMP-08** |
| 5b | Component library | **PAY-14** |
| 5b | Template builder and CTC designer | **PAY-13** |
| 5b | Compensation and revision | **PAY-12** |
| 5b | Payslip layout editor | **PAY-15** |
| 5b | Coverage monitor | **PAY-30** |
| 5b | Pay groups, calendars, policies, loans settings | Settings Group 4 (`registry-g4.ts`) |
| 5b | Import as-paid lines / opening balances | P15 import screens; **new** step for payroll |
| 5c | Payroll home | **PAY-01** |
| 5c | Run readiness | **PAY-02** |
| 5c | Run workspace (inputs, payslips, variance, validations, approvals, files) | **PAY-03** |
| 5c | Manual LOP input | **PAY-04** |
| 5c | One-time pay | **PAY-05** |
| 5c | Salary holds and releases | **PAY-06** |
| 5c | Approve run and lock period | **PAY-07** |
| 5c | Loans and advances; loan request | **PAY-17**, **PAY-18** |
| 5c | Court orders and recoveries | **PAY-19** |
| 5c | Bonus computation | **PAY-24** |
| 5c | Payroll reports | **PAY-25** |
| 5d | Release bank file | **PAY-08** |
| 5d | Publish payslips | **PAY-09** |
| 5d | Payments and files | **PAY-10** |
| 5d | Payslip viewer (desktop and mobile Pay tab) | **PAY-21** |
| 5d | Payslip query queue | **PAY-20** |
| 5d | Bank format and accounting mapping settings | Settings Group 4 (accounting items exist); bank format picker **new** |
| 5e | Tax workspace | **PAY-22** |
| 5e | Compare tax regimes | **PAY-41** |
| 5e | Proof verification queue | **PAY-23** |
| 5f | Statutory hub | **CMP-01** |
| 5f | TDS challan sheet | **CMP-04** |
| 5f | TDS return wizard | **CMP-05** |
| 5f | Form 130 / 16 bulk | **CMP-06** (rename labels by law version) |
| 5f | Missing-ID dashboard | **CMP-07** |
| 5f | Statutory registers and inspection pack | **CMP-03** |
| 5f | Supplementary filing | **CMP-12** |
| 5g | Off-cycle run | **PAY-11** |
| 5g | Arrears base confirmation | **PAY-28** |
| 5g | Wage-settlement arrears | **PAY-37** |
| 5g | F&F calculator | **PPL-22** |
| 5g | Alumni and nominee portal | **T9-02**; verify page **T9-08** |
| 5h | Consultant register, invoice inbox, Form 140 / 131 cards | — **new** |
| 5h | Consultant portal (own invoices, payments, advices, Form 131) | — **new** (T9 family) |
| 5i | EWA request / admin; weekly and fortnightly runs; piece-rate; incentive plan / statement; tips; on-call; union check-off; actuarial | **PAY-26**, **PAY-27**, **PAY-29**, **PAY-31**, **PAY-32**, **PAY-33**, **PAY-34**, **PAY-35**, **PAY-36**, **PAY-38** |
| 5i | Equity, country-pack cards | — **new** |
| 5j | Why is my pay different (pay-diff explainer) | **PAY-40** |
| 5j | Suggest split | **PAY-42** |
| 5j | My pay band | **PAY-39** (M06 / pay ranges; wired when pay ranges are) |
| — | YukthiX console: rule-set editor, golden-case runner, review queue, bank formats | **PLT-33…37, 44** (Rules), Platform governance |

**PAY-43** (group health insurance quotes) belongs to M11 Benefits / P23 marketplaces and is not in step 5.

---

## 16. Test plan

Every slice ships its tests. Every batch ends with a full green run and an independent security review before its pull request (roadmap rule). Testing follows "review in one go": automated checks + a fixed checklist + one verify pass.

### 16.1 Tests that run for every batch

| Kind | What |
|---|---|
| RLS guard | Every pay table: forced RLS, `tenant_isolation`, `support_session_excluded`, pay guard where listed. A second-tenant session reads 0 rows and cannot insert. A same-tenant user without a pay key reads 0 payslip rows **at SQL level**. A super-admin session reads 0 pay rows. Generated from the migration list. |
| Permission guard | Every endpoint declares a key (YX-SEC-01); unannotated route fails CI. Plain employee calling ECR or tax-report APIs gets 403 (IN-D8, D-D9). |
| Money guard | Lint rule: no `number` type for fields named amount / gross / net / tax in `payroll/` and `statutory/`; Decimal only. |
| No country constants | CI scan (US-E-347) for rates, slabs, ceilings, dates in code. |
| Audit | Each write endpoint writes one audit row in the same transaction; chain verifies after the test suite. |
| OpenAPI | Contract generated and diffed (YX-API-04). |
| UI | Playwright on wired screens; dead-button scan = 0; PAY-CHECKLIST money rules (gross = Σ earnings, net = gross − deductions, Indian number format). |

### 16.2 Golden-file payroll tests (per state)

- A **golden case** = one employee + one period: inputs (compensation, template, statutory profile, attendance feed, one-time pay, tax workspace) and the **expected payslip lines**, stored as JSON in `apps/api/test/payroll/golden/<state>/<case>.json`.
- Each case cites the rule-set versions it was written for. The runner calls `calculatePayslip()` directly (no database), so hundreds run in seconds.
- **Minimum set per pilot state** (Karnataka, Tamil Nadu, plus the states chosen in §19 D2): ~25 cases each, covering:
  - PF below / at / above ceiling, pre-2014 member, age 58, higher pension, VPF, international worker;
  - ESI just below / above ceiling, mid-period crossing, contribution-period continuation, PwD;
  - PT every slab, the February / annual-cap case, gender slab where the state has one, state change mid-month;
  - LWF deduction month and non-deduction month;
  - mid-month joiner, leaver, revision on the 15th (two segments, prorated once), LOP, half days;
  - Code wage add-back; period straddling 21 Nov 2025;
  - TDS new and old regime, no PAN, 12B income, proofs after cut-off spread over remaining months;
  - deduction cap with court order + EMI; negative net carry-forward.
- **The M03 §9 acceptance tests** are all golden cases (e.g. tax on ₹8 L at the 4–8 L slab = ₹20,000; EPS ₹1,250 and EPF ₹1,150 at basic ₹20,000 for a pre-2014 member; ESI ₹113 at gross ₹15,050; Kerala PT never above ₹2,500 a year).
- **Regression pack** (US-E-212): every golden case for every published rule-set version must still pass at release. A new rule-set version must ship with its own cases (YX-STAT-04).
- **Reproduce test:** every golden payslip is stored, re-run from its snapshot, and must give the same result hash.

### 16.3 Property tests (fast-check)

| Property | Over |
|---|---|
| PT never exceeds the state's annual cap; every slab boundary is inclusive the right way | Random monthly wages × 12 months × every state rule set |
| ESI amount is always a whole rupee, rounded **up**; zero when not covered | Random wages, days, mid-period changes |
| PF employee ≤ 12 % of PF wage (or ceiling); EPF employer + EPS = employer 12 % share | Random wages and flags |
| Code wage ≥ basic + DA; add-back = max(0, exclusions − 50 % total) | Random component mixes |
| Proration: sum of segment amounts = full amount when there is no LOP; never prorated twice | Random segment splits |
| Total deductions ≤ legal cap; net ≥ protected net, or the shortfall is a carry-forward | Random recoveries and orders |
| TDS: sum of monthly TDS over a year with no changes = annual tax (± ₹1 per month rounding) | Random salaries, both regimes |
| Tax sheet total = TDS deducted | Any run |
| Formula evaluator: never throws on a validated tree; refuses any non-allow-listed node | Random generated trees (incl. hostile ones: `constructor`, `__proto__`, very deep nesting) |
| Rounding: Decimal results identical to a reference big-integer paisa implementation | Random amounts |

### 16.4 Parallel-run comparison (go-live, US-E-253)

- The pilot runs the **first live month in parallel** with its old system (P15 YX-MIG-08; the company setting decides how many months; a waiver is explicit and audited).
- The old system's payslips are imported as a **reference sheet** (CSV / XLSX: employee code, component, amount). Component names are mapped once.
- The comparison report shows per employee and per component: ours, theirs, difference, and our explanation. Totals per statute (PF, ESI, PT, LWF, TDS) are compared too.
- **Pass** = zero unexplained difference. Every difference is either fixed or marked "explained" with a reason (e.g. "old system did not apply the Code wage add-back") and signed off by the Payroll Admin and the partner CA.
- Pilot exit (P15 Q6): 3 consecutive live cycles with zero unexplained variance and PF ECR, ESI and TDS files accepted by the portals.

### 16.5 Per batch

| Batch | Key tests |
|---|---|
| **5a** | Lock: a direct SQL update of an attendance row in a locked period fails; late request lands as a correction next month. Audit: `UPDATE audit_logs` refused for the app role; tampered row breaks chain verification and alerts. Dialog evidence stored. |
| **5b** | Formula: cycles named; hostile formulas refused; sample run required. CTC solver: converges; ESI threshold case picks the consistent answer. Compensation: below floor wage warns; revision through P03; retro tiers. Rule store: app role cannot write; overlapping slabs rejected at publish. |
| **5c** | Run: two calculations of one run never overlap; a failed employee does not move the run; duplicate regular payslip refused by the database; void keeps payslips. Approval: maker removed; self-approval with reason notifies owner; step-up asked; blocked by open exceptions (block groups) and by a crossed threshold. Payslip immutable after approval (trigger). Holds idempotent. |
| **5d** | Bank file: leading zeros kept in TXT and XLSX; held / unverified excluded; hash checked before release; maker cannot release; regenerate needs reason. Payment failure flow end to end. Payslip PDF matches stored lines; mandatory fields locked. |
| **5e** | Regime cut-off; proof after cut-off spreads tax; HRA per month; no-PAN 20 %; NRI no 87A; rehire same FY combines YTD; law version picks 24Q vs Form 138. |
| **5f** | ECR / ESI / PT / LWF files against the published format samples; regenerate after filing refused; supplementary ECR linked; reconciliation must be zero before FVU; FVU worker has no network; registers frozen and signed; employee sees only own register row. |
| **5g** | Arrears per month = corrected − as-paid; missing imported month asks for a base; F&F auto-created with the right deadline over a weekend and holiday; retrenchment lines; death-in-service split by shares. |
| **5h** | Duplicate invoice refused; TDS on taxable value excl. GST; threshold crossing; 197 certificate within limit; consultant sees only own rows. |
| **Load** | 10,000 employees in one pay group calculate in under 10 minutes on the pilot hardware; payslip list p95 < 300 ms. |

---

## 17. Build order (PR-sized slices)

Each slice is one pull request with its migration, API, tests and (where listed) wired screen. IDs are stable; a new slice gets the next free number in its batch. `PAY-1.xx` = batch 5a, `PAY-2.xx` = 5b, … `PAY-10.xx` = 5j. "Stories" link to C.json (US-C), A.json (US-A) and E.json (US-E).

### 17.1 Batch 5a · Locks, audit and documents (12 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-1.01 | Payroll permission keys and role templates (Payroll Admin / Approver extended; Finance Approver, Compliance Owner, Payroll Auditor new); pay visibility guard (`app_pay_entities()`, `app_current_employee_ids()`), `support_session_excluded` on pay tables, CI guard; `payroll-write` API-key scope | US-E-226 |
| PAY-1.02 | `pay_periods` and the lock service: stages, `pay_period_stage()` in the same transaction, `BEFORE` triggers on attendance, pay-affecting leave and payroll inputs | US-C-077 |
| PAY-1.03 | Late requests on frozen / locked dates; corrections into processed payroll (Payroll Admin step, arrears in next run) | US-C-078, US-A-150 |
| PAY-1.04 | HR device backfill for late biometric batches | US-C-079 |
| PAY-1.05 | Audit hash chain: append-only grants, `prev_hash` / `row_hash`, daily verify job, anchors, alerts | US-C-081 |
| PAY-1.06 | Audit viewer and record timeline: business events only, masked Confidential diffs, sensitive-view de-duplication, audited export | US-C-082 |
| PAY-1.07 | Audit retention (8 years, 13 months online), archive job, legal hold | US-C-083 |
| PAY-1.08 | Irreversible-action dialog evidence in the audit row | US-C-084 |
| PAY-1.09 | Pay documents on the P05 store: templates, render worker, immutable issue with hash, gap-free numbers, verify code; DSC signing adapter (per §19 D4) | US-C-085, US-C-086 |
| PAY-1.10 | Alumni and nominee access to pay documents; document retention and deletion | US-C-087, US-C-088 |
| PAY-1.11 | `exchange_files`: hash, row count, total, audited download, maker ≠ checker release primitive | US-E-281 |
| PAY-1.12 | CI scan: no country constants in code | US-E-347 |

### 17.2 Batch 5b · Setup, structures and components (13 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-2.01 | Rule store to the P07 shape: move to `statutory` schema; status, law version, transitional, verify; `golden_cases`, `calendar_rules`, `law_crosswalk`; console write role with maker ≠ checker (builds the minimum of US-C-024 if step 4 has not) | US-C-093 |
| PAY-2.02 | Statutory evaluator (rate, slab, list, calendar, coverage shapes; Decimal; rounding; conditions) + golden-case runner + calculators skeleton | US-C-093 |
| PAY-2.03 | India pack content: `IN.PF`, `IN.ESI`, `IN.PT`, `IN.LWF`, `IN.MW` (all states), `IN.BONUS`, `IN.GRATUITY`, `IN.WAGES`, `IN.WAGES-CODE`, `IN.SS-CODE`, `IN.TDS` (both law versions), penalties, compliance calendar, employment-type defaults; each with source and golden cases | US-C-093, US-A-153 |
| PAY-2.04 | Entity set-up: statutory registrations, deductor details, completeness check, legal options (dated); set-up wizard state | US-C-089 |
| PAY-2.05 | Pay groups, membership, pay calendars, periods with cut-off; mid-period method per change type | US-A-152 |
| PAY-2.06 | Formula language: `jsep` parse → validated typed tree → Decimal evaluator, in `rules-engine/expressions.ts` (desk formula fields move onto it) | US-C-090 |
| PAY-2.07 | Component library with wage flags; Code wage (50 % add-back) | US-C-091 |
| PAY-2.08 | Salary templates: versions, dependency order, cycle check, sample run; CTC-first solver with balancing component and employer costs inside CTC | US-C-090 |
| PAY-2.09 | Compensation: assign / revise as P06 change + P03; CTC-first and fixed entry; hourly / daily basis; minimum and floor wage check; revision letter | US-C-092 |
| PAY-2.10 | Employee statutory profile (dated), defaults by employment type from P07, legal-option overrides only | US-A-153 |
| PAY-2.11 | Statutory coverage monitor (daily job, thresholds, sticky PF) | US-C-094 |
| PAY-2.12 | Opening balances, Form 12B, as-paid lines and full-history import through the P15 pipeline; go-live check for as-paid coverage | US-C-095, US-E-254, US-E-255 |
| PAY-2.13 | Payslip layout per entity (P05 kind "payslip", locked mandatory fields, real preview, languages) | US-C-096 |

### 17.3 Batch 5c · Run engine and India statutory core (18 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-3.01 | Run model and state machine; one regular payslip per period (DB index); void, never delete | US-C-105 |
| PAY-3.02 | Inputs: freeze and copy the M02 feed; manual LOP (Assumed present, CSV upload); one-time pay with sources and recurring items | US-C-098 |
| PAY-3.03 | Readiness screen data and pre-run validation (all YX-PAY-05 checks, waivers, block / warn by group) | US-C-097 |
| PAY-3.04 | Calculation engine: pure `calculatePayslip()`, segments, proration once, explanations, rule citations, snapshots and hashes; BullMQ fan-out with per-employee progress | US-C-099, US-A-151 |
| PAY-3.05 | PF, EPS, EDLI, admin charges, VPF, special EPS rules, arrears basis | US-C-100 |
| PAY-3.06 | ESI coverage, contribution periods, rounding, PwD ceiling | US-C-101 |
| PAY-3.07 | PT and LWF by work state; one liable state per slot; annual cap | US-C-102 |
| PAY-3.08 | Variance review and acknowledgements | US-C-103 |
| PAY-3.09 | Submit and approve: P03 `payroll.run`, two levels by default, maker ≠ checker, step-up, dialog; blocks; lock period with attendance and leave | US-C-104, US-A-154 |
| PAY-3.10 | Reopen a locked payroll (high-risk request; new payslip versions) | US-C-080 |
| PAY-3.11 | Salary holds, auto triggers, idempotent release, hold ageing | US-C-106 |
| PAY-3.12 | Recoveries in legal order, protected net, deduction cap, negative net carry-forward, court orders; **loans and salary advances** (Q4) | US-C-107, *loan story to add (§18.2)* |
| PAY-3.13 | Subsistence allowance during suspension | US-C-108 |
| PAY-3.14 | Maternity benefit and injury pay | US-C-109 |
| PAY-3.15 | Statutory bonus (annual / monthly per entity) and gratuity provision | US-C-110 |
| PAY-3.16 | Hourly and daily rate pay from the timesheet feed | US-C-111 |
| PAY-3.17 | Journal export (Tally, Zoho Books, CSV, Accounting API) and employee cost rates | US-C-112 |
| PAY-3.18 | "Reproduce this payslip" and the golden / regression pack harness in CI | US-A-151, US-E-212 |

### 17.4 Batch 5d · Pay-out and payslips (6 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-4.01 | Bank format registry (platform data) + writers (generic NEFT / RTGS first, then banks per §19 D1); generate, integrity check, release with maker ≠ checker and step-up | US-C-113, US-E-281 |
| PAY-4.02 | Payment results (bank response file or manual), failure flow, expedited bank fix | US-C-114, US-A-155 |
| PAY-4.03 | Cash and cheque disbursement register | US-C-115 |
| PAY-4.04 | Publish payslips, viewer, "why this number", signed PDF links, watermark | US-C-116 |
| PAY-4.05 | Payslip PDF by email (company option, default off) | US-C-117 |
| PAY-4.06 | Payslip queries | US-C-118 |

### 17.5 Batch 5e · Income tax (8 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-5.01 | Tax workspace and regime choice with cut-off | US-C-119 |
| PAY-5.02 | TDS calculators per tax year and law version; monthly projection; tax sheet from the same function | US-C-120, US-C-126 |
| PAY-5.03 | Declarations (Form 12BB / successor) and line-by-line proof verification | US-C-121 |
| PAY-5.04 | HRA exemption month by month | US-C-122 |
| PAY-5.05 | Missing / inoperative PAN (P10 check), residential status, DTAA / TRC | US-C-123 |
| PAY-5.06 | Perquisites and Form 12BA, leave encashment exemption, VRS tax | US-C-124 |
| PAY-5.07 | Continuity across transfers and rehires; transfer continuity checklist | US-C-125, US-A-157 |
| PAY-5.08 | Year-end Form 130 (Form 16 for old years): Part A import, Part B, DSC, publish to employees and alumni | US-C-127 |

### 17.6 Batch 5f · Statutory files, returns and registers (10 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-6.01 | Statutory hub, filings model, compliance calendar items, penalty estimate, audited downloads | US-C-128 |
| PAY-6.02 | PF ECR (with ELI fields, NCP days, IW-1) and ESI contribution file | US-C-129 |
| PAY-6.03 | PT and LWF returns per state | US-C-130 |
| PAY-6.04 | TDS challans pre-filled with interest and fee | US-C-131 |
| PAY-6.05 | Quarterly TDS return (Form 138 / 24Q): rows, reconciliation, FVU worker, self-file path, TRACES Part A import | US-C-132 |
| PAY-6.06 | Filing-partner adapter (TDS + PF / ESI / PT / LWF), per-entity filing mode; timing per §19 D3 | US-C-128, US-C-132 (mode); *partner story to add (§18.2)* |
| PAY-6.07 | Correction returns and revised Form 130 / 131 | US-C-133 |
| PAY-6.08 | PF / ESI supplementary filings, interest and damages lines, excess adjustment / refund | US-C-134 |
| PAY-6.09 | Always-on registers, DSC signing, versions, inspection pack; employee sees own row only | US-C-135, US-A-156 |
| PAY-6.10 | Labour-law advisory feed (tenant side) | US-C-137 |

### 17.7 Batch 5g · Off-cycle, arrears and F&F (7 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-7.01 | Off-cycle runs (bonus, arrears only, correction, payment) on the same engine | US-C-138 |
| PAY-7.02 | Arrears engine: per month, per component, corrected − as-paid; imported base and base confirmation; statutory basis on arrears | US-C-139 |
| PAY-7.03 | Past-dated rule change → arrears / recovery proposal, accept or dismiss | US-C-136 |
| PAY-7.04 | F&F run created on LWD with the 2-working-day deadline; leave and notice effects; gratuity; SLA alerts | US-C-140 |
| PAY-7.05 | Retrenchment compensation, notice pay, re-skilling fund, 300+ permission check | US-C-141 |
| PAY-7.06 | F&F on death in service: nominees by share, legal heirs, heir TDS, nominee login | US-C-142 |
| PAY-7.07 | Overpayment recovery plan with consent; cross-year reporting; write-off | US-C-143 |

### 17.8 Batch 5h · Consultants (4 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-8.01 | Consultant register (encrypted PAN / GSTIN / bank, penny-drop) and Consultant login | US-C-144 |
| PAY-8.02 | Consultant invoices, P03 approval, payment in the month's bank file, payment advice | US-C-145 |
| PAY-8.03 | TDS on consultant invoices (sections, thresholds, 206AA, 197 certificates) | US-C-146 |
| PAY-8.04 | Form 140 and Form 131 on shared challans | US-C-147 |

### 17.9 Batch 5i · Special pay and later waves (12 slices)

Not needed for the pilot except the three wave-3 items, which come right after it.

| ID | Slice | Wave | Stories |
|---|---|---|---|
| PAY-9.01 | Weekly and fortnightly pay groups (PF / ESI per run, monthly returns aggregate, part-period PT / LWF) | 3 | US-C-149 |
| PAY-9.02 | Piece-rate pay with minimum-wage top-up | 3 | US-C-150 |
| PAY-9.03 | Actuarial census and provision journals | 3 | US-C-155 |
| PAY-9.04 | Union check-off, wage settlements by category, lay-off pay, VRS | 4 | US-C-154 |
| PAY-9.05 | Earned wage access: policy, draws, partner connector, recovery, remittance | 5 | US-C-148, US-E-285 |
| PAY-9.06 | Incentive and commission plans with statements and clawbacks | 5 | US-C-151 |
| PAY-9.07 | Tips and service-charge pooling | 5 | US-C-152 |
| PAY-9.08 | On-call, standby and call-out pay | 5 | US-C-153 |
| PAY-9.09 | ESOP: plans, grants, vesting, exercise with perquisite and deferral, cap table | 6 | US-C-156 |
| PAY-9.10 | Country-pack framework for legal entities | 6 | US-C-157 |
| PAY-9.11 | UAE WPS SIF and end-of-service gratuity | 6 | US-C-158 |
| PAY-9.12 | US 1099-NEC reporting for contractors | 6 | US-C-159 |

### 17.10 Batch 5j · Screens, explainers and go-live gates (8 slices)

| ID | Slice | Stories |
|---|---|---|
| PAY-10.01 | Wire run screens PAY-01…11 against the API; checklist pass at 1440 / 871 / 390 | US-C-160, US-A-060 |
| PAY-10.02 | Wire set-up and compensation screens (PAY-12…16, PAY-30, Settings Group 4) | US-C-161 |
| PAY-10.03 | Wire employee pay, tax and query screens (PAY-20…23, PAY-41, mobile Pay tab) | US-C-162 |
| PAY-10.04 | Wire compliance screens CMP-01…08, CMP-12, PPL-22, T9-02; build the new consultant screens; dead-button scan = 0 | US-A-060 |
| PAY-10.05 | Pay-diff explainer and tax planner (deterministic: causes only from payroll records; amounts only from M03 / P07 engines); helper switches and audit | US-E-323, US-E-324, US-E-333 |
| PAY-10.06 | Salary structure "suggest split" for HR (within template rules and law) | US-E-325 |
| PAY-10.07 | Parallel run: reference-sheet import, comparison report, sign-off or audited waiver; go-live readiness page | US-E-253 |
| PAY-10.08 | Release gate: golden / regression pack per rule-set version required in CI; load test before the pilot | US-E-212 |

**Total: 98 slices** (12 + 13 + 18 + 6 + 8 + 10 + 7 + 4 + 12 + 8). Every story `US-C-077…162` is in at least one slice, plus `US-A-150…157`, `US-A-060` and the E stories listed in the header.

**Pilot order** (M03 §8): 5a → 5b → 5c → 5d → 5e (Form 138 and Form 130 before the first quarter end of the pilot) → 5f → 5g → 5h. Batch 5j's wiring slices run alongside each batch where the API is ready; PAY-10.07 and PAY-10.08 close before the first live month.

---

## 18. Step-5 stories owned elsewhere, and missing stories

### 18.1 In the step-5 order band but not in this design

These stories carry step-5 order numbers but belong to their own design docs. They are listed so nothing is lost.

| Stories | Owner doc | Why here only as a dependency |
|---|---|---|
| FT-E-42: US-E-298…304, US-E-239 (metric layer, dashboards, report builder, scheduled exports) | P09 | Pay reports (RPT-PAY / RPT-STAT) use it; exports must stay audited and masked (§12.5) |
| FT-E-43: US-E-312…322 (partner and accountant console) | P16 | **US-E-315** (client approval for payroll release and filings) adds a client step to PAY-3.09 / PAY-4.01 / PAY-6.05 when a partner prepares payroll |
| US-E-252 (direct API pull from the old system) | P15 | Optional feeder for PAY-2.12 |
| US-E-210, US-E-211, US-E-213 (backups, monitoring, probes) | P13 | Must be in place before the pilot |
| US-E-251, US-E-256, US-E-257, US-E-241, US-E-275, US-E-308 (demo data, sandbox, promotion, health feed) | P15 / P14 | Sandbox payroll runs use stubbed bank and filing adapters |
| US-E-309, US-E-310, US-E-258 (product analytics, pilot exit tracking) | P20 / P15 | Pilot exit criteria read §16.4 results |
| FT-A-044: US-A-160…170 (security programme) | P12 / P13 | **US-A-160** per-company keys encrypt pay files at rest (§5.1); pen test before the pilot |
| FT-A-045: US-A-175…182 (privacy programme) | P02 / DPDP | Payroll data is in the record of processing and retention schedule |

### 18.2 Stories to add (gaps found while writing this design)

The coordinator owns the tracker; these are proposals only.

| Proposed | Why | Slice |
|---|---|---|
| "Loans and salary advances with EMI recovery" (M03 Q4: request via P03, limits, interest and perquisite, pause / pre-close, balance to F&F) | Decided for launch and has screens PAY-17 / PAY-18, but no story | PAY-3.12 |
| "Filing partner adapter per entity" (M03 Q6 / Q7: transmit, status sync, acknowledgement, Part A fetch) | Decided for launch, no story | PAY-6.06 |
| "Bank format registry and bank-response import" (P10 Q5 formats; paid / failed rows from the bank's file) | Covered only implicitly by US-C-113 / 114 | PAY-4.01, PAY-4.02 |
| "Reproduce a payslip from its snapshot" (auditor action) | YX-HIS-09 has a story (US-A-151) but no user-facing action | PAY-3.18 |

---

## 19. Decisions (founder, 9 Oct 2026)

All five recommendations below were accepted on 9 Oct 2026:
1. **Bank files:** the generic format plus the pilot customer's bank first; more banks by demand.
2. **States with full golden tests and CA sign-off:** Karnataka, Tamil Nadu, Maharashtra, Telangana, Delhi.
3. **Filing:** the pilot customer self-files from our outputs; the filing-partner adapter ships before public launch.
4. **DSC key:** a USB-token signing helper for the pilot; a key held in our HSM later.
5. **Pay amounts at rest:** plain columns behind the two database guards (forced RLS + the pay guard), not per-field encryption; identifiers stay encrypted.

The options that were weighed are kept below for the record.


Only things **not** already decided. Each has options and a plain recommendation.

### D1 · Which bank formats to build first

P10 Q5 fixed the launch set (generic NEFT / RTGS, HDFC, ICICI, SBI, Axis, Kotak). Open: the order, since each bank's corporate format must be checked against a real sample file from a customer.

| Option | Meaning | Good | Not so good |
|---|---|---|---|
| **a. Generic + the pilot's bank first** (recommended) | Build the generic NEFT / RTGS file and the pilot customer's bank. Add the other four before public launch, one sample file each. | Fastest to a real first payroll; each format tested on a real upload. | Other banks wait a few weeks. |
| b. All six before the pilot | Build every format now. | Nothing left later. | Four formats built without a real sample; likely rework. |
| c. Generic only for the pilot | Customer uses its bank's generic bulk upload. | Least work. | Many corporate portals reject the generic layout; poor first impression. |

### D2 · Which states get full golden tests and CA sign-off for the pilot

P07 Q7 already says minimum wages for **all** states from the pilot, and the pack covers all PT / LWF states. Open: which states get the **deep** treatment first (25+ golden cases, partner-CA sign-off, verify flag cleared) beyond Karnataka and Tamil Nadu.

| Option | States | Good | Not so good |
|---|---|---|---|
| **a. KA, TN + Maharashtra, Telangana, Delhi** (recommended) | Two pilot states, the two largest PT states for tech / services hiring, and Delhi as a no-PT, LWF-only control | Covers the slab shapes (gender slab, February rule, no PT), so most other states are only content | ~5 × 25 cases to write and verify |
| b. KA and TN only | Pilot states only | Smallest work before the pilot | A pilot employee in another state (remote staff) has no deep tests |
| c. Top 10 states by employment | Broad | Ready for many customers | Delays the pilot by weeks |

### D3 · Filing partner: before or after the pilot

M03 Q6 / Q7 decided **both** filing modes at launch, and the team still has to choose the partner. Open: whether the partner adapter is needed **for the pilot**, or the pilot starts with self-file.

| Option | Meaning | Good | Not so good |
|---|---|---|---|
| **a. Pilot on self-file; partner adapter before public launch** (recommended) | The pilot's first returns go through our FVU check and HR's upload. The partner adapter (PAY-6.06) is built once the partner is chosen. | No dependency on a contract for the pilot; self-file path proves our files first. | The pilot's HR does the uploads themselves. |
| b. Partner adapter before the pilot | Choose the partner now; both paths ready. | Pilot can choose. | Blocks the pilot on a partner contract and their API. |
| c. Partner only | Skip self-file. | Less code. | Breaks the decision (both modes); no fallback if the partner is down. |

### D4 · How the company DSC signs Form 130 and registers

P05 Q2 decided the company DSC signs; it did not decide **where the signing key lives**. Indian Class 3 organisation certificates are normally issued on a hardware token, so we cannot simply store a key file.

| Option | Meaning | Good | Not so good |
|---|---|---|---|
| a. **Signing helper with the company's USB token** | A small desktop helper (signed installer) signs a batch: the server prepares the PDFs, the helper signs locally with the token, uploads the signed files. | Uses the token the company already has; YukthiX never holds the key. | Needs a Windows / Mac helper; signer must be at a PC with the token. |
| b. **Document Signer certificate in our cloud HSM** | The company buys a document-signer certificate whose key is created in our HSM, one per company; the server signs after step-up. | Fully automatic bulk signing (registers every month, Form 130 for thousands). | HSM cost and key-custody duty for us; one more sub-processor if the HSM is a service. |
| c. **Remote signing from a licensed CA** | The CA holds the key in its HSM; we call its signing API per batch. | No key custody for us; automatic. | Per-signature cost; new sub-processor; vendor lock-in. |

**Recommendation:** **a for the pilot** (no key custody, works with existing tokens, monthly register signing is a few clicks), and **b after the pilot** for companies that want full automation. Verify with the compliance owner that a token-signed Form 130 and registers are accepted as-is.

### D5 · Payslip amounts at rest: plain columns or field encryption

P02 makes pay Confidential. Identifiers are already field-encrypted. Open: whether amounts on payslips, lines and compensation are also field-encrypted.

| Option | Meaning | Good | Not so good |
|---|---|---|---|
| **a. Plain `NUMERIC` + two RLS layers + per-company storage keys** (recommended) | Amounts readable only through forced RLS (tenant) and the pay guard (own rows or pay entities); disks and backups encrypted with per-company keys (US-A-160); support sessions and super-admin excluded in the database. | Sums, reports, variance and journals stay fast and simple; the database still refuses unauthorised reads. | A full database dump with the app's own credentials could read amounts (mitigated by per-company keys and secrets management). |
| b. Encrypt every amount column | Each amount sealed like identifiers. | Strongest at rest. | Every total, report and comparison must decrypt in the app; slow, complex, easy to get wrong; no SQL aggregates. |
| c. Encrypt only the snapshot and explanation JSON | Amount columns plain, detailed inputs sealed. | Hides inputs like LOP reasons and tax declarations at rest. | Adds a decrypt step to "why this number" and reproduce; partial benefit. |

### 19.1 Batch 5a build decisions (founder, accepted 9 Oct 2026)

Raised while building batch 5a and accepted on 9 Oct 2026. Built on `feat/yukthix-payroll-5a`.

| # | Decision | What is built |
|---|---|---|
| 5a-D1 | **USB-token signed PDFs are accepted only if all three hold:** (a) the PDF signature is cryptographically valid; (b) the signer certificate chains to an India CCA-licensed CA, is inside its validity period and is not revoked (OCSP, else CRL); (c) the signed byte range starts with exactly the document we issued (its stored SHA-256 and length). | Shared `apps/api/src/documents/signed-pdf.ts` using PKI.js (no hand-rolled cryptography). The CCA root list is configurable data (`apps/api/config/dsc-trusted-roots.pem`, or `DSC_TRUSTED_ROOTS`). Every refusal gives a plain reason and is audited. Letters (P05 Q2) and Form 130 / 131 / registers wait for the signature. |
| 5a-D2 | **Frozen dates block attendance and leave changes in the database**, like locked and filed dates. | `yx_time_locked` refuses on `frozen`, `locked` and `filed`; employees use a late request, paid in the next payroll. A frozen month is locked as it is (no re-evaluation). |
| 5a-D3 | **Former employees sign in with their personal email on record, else their old work email**, for now. | As built. The "HR confirms the personal email at exit" step belongs to the lifecycle (onboarding / exit) batch. |
| 5a-D4 | **The pay guard extends to the compensation tables in batch 5b; the time payroll feed stays attendance data** (no pay guard). | Part of the 5b plan: the `pay_guard` policy (own employee or `app_pay_entities()`) is added to `compensations` and the 5b compensation tables, with the CI catalogue test. |

### 19.2 Batch 5b build decisions (founder, accepted 9 Oct 2026)

Raised while building batch 5b and accepted on 9 Oct 2026. Built on `feat/yukthix-payroll-5b`.

| # | Decision | What is built |
|---|---|---|
| 5b-D1 | **State minimum wages are data:** state, zone, skill, effective dates and the source notification, loaded through the console's draft-then-publish flow by two staff. Seed the states the demo companies use from official notifications, in our own words, every value marked *verify*. No invented figures; a state with no reachable official source stays empty and is listed. | Rule sets `IN.MW` per state and scheduled employment (`kind: min_wage_table`: zones, skill classes, basic and VDA per month, the notification with its link and file hash). Publishing checks that printed totals add up. Loaded by `scripts/load-min-wages.ts` and the seed (drafted by one staff member, published by another). Seeded: Karnataka shops and commercial establishments 2026-27 (KAE 20 LMW 2017 with the 2026-27 VDA) and Tamil Nadu G.O.(2D) No.65 of 2024 (basic; the yearly DA is not loaded and the check says so). Uttar Pradesh is left empty: no current official order was reachable. The salary check uses the place's zone; without a skill class on record, the lowest class of the zone applies. |
| 5b-D2 | **Payslip languages:** Google Noto fonts (SIL OFL), cut to the glyphs used; Hindi, Tamil, Telugu and Kannada payslips; English stays the default. | A layout is English plus at most one regional language; labels print in that script with the English beside them. Fonts in `apps/api/assets/fonts` with `OFL.txt`, cut by `scripts/subset-payslip-fonts.ts` (fonttools); a test fails if a label loses a glyph. The wording is to be read once by a native speaker before go-live. |
| 5b-D3 | **CCA roots** come from the official CCA source (cca.gov.in) with SHA-256 fingerprints, through the two-person publish flow. | Rule set `IN.CCA-ROOTS` (CCA India 2022 and CCA India 2022 SPL, fetched from the CCA's Root Certificate page) replaces the PEM config file of 5a-D1. A root whose bytes do not match its fingerprint is refused at publish and never trusted. `scripts/load-cca-roots.ts` reads the CCA's DER, PEM or base64 files. |

### 19.3 Batch 5c build decisions (founder, accepted 9 Oct 2026)

Raised while building batch 5c and accepted on 9 Oct 2026. Built on `feat/yukthix-payroll-5c`.

| # | Decision | What is built |
|---|---|---|
| 5c-D1 | **Uttar Pradesh minimum wages and the Tamil Nadu dearness allowance wait for the official orders** from the compliance owner. They are open data items, not code. | Nothing to build: the tables load through `scripts/load-min-wages.ts` (two staff) when the orders arrive. Until then UP falls back to the national floor and Tamil Nadu is checked on its basic rate, with a warning on the breakup. Listed in the go-live checklist (item 14). |
| 5c-D2 | **Skill class on the job:** unskilled, semi-skilled, skilled, highly skilled, effective-dated like the other job fields and visible to HR; the minimum-wage check uses it and falls back to the lowest class with a warning when it is empty. | `employee_assignments.skill_class` (checked values), set by a promotion, redesignation or correction through the P06 change history (approved by someone else). Shown on the person's job record and in the change drawer. The salary breakup and the payroll run use it; a missing or unlisted class uses the zone's lowest class, with a warning on the breakup and a run check (`skill_missing`). |
| 5c-D3 | **Subsistence, maternity and injury figures stay marked "verify"** for the compliance owner and the partner CA. | They stay in `packs/in-run.json` marked verify; every payslip line from them carries the verify flag. Added to the go-live checklist (item 13). |

### 19.4 Open data items

| Item | Owner | Until it is loaded |
|---|---|---|
| Uttar Pradesh minimum wages (current schedules and VDA) | Compliance owner | The national floor wage is used for UP places. |
| Tamil Nadu dearness allowance for the year (shops and commercial establishments) | Compliance owner | The check compares the basic rate and says the DA is missing. |
| The pilot customer's bank file format (5d-D1) | Compliance owner with the pilot customer | Bank files use the generic NEFT / RTGS format; the bank's own layout is loaded as a bank-format rule set (two staff) once a real sample file is checked. |

### 19.5 Batch 5d build decisions (founder, accepted 9 Oct 2026)

Raised while building batch 5d and accepted on 9 Oct 2026. Built on `feat/yukthix-payroll-5d`.

| # | Decision | What is built |
|---|---|---|
| 5d-D1 | **Bank formats: only the generic NEFT / RTGS format for now.** The pilot customer's bank format is loaded as data once a real sample file is checked. | Bank formats are published rule sets (`IN.BANKFMT`, two staff); the generic XLSX layout is the only one. The pilot's bank is an open data item (§19.4) and go-live checklist item 15. |
| 5d-D2 | **Penny drop: for the pilot, a second person records the test-payment reference** from the company's bank. An automatic provider is chosen later. | The urgent bank fix after a failed payment needs a checker (not the employee), a fresh second sign-in and the penny-drop reference; it is audited. The provider seam is the single place that accepts a verified reference; no provider is wired. |
| 5d-D3 | **Emailed payslip password: one the employee sets in My security**, stored as a hash with the platform's password hashing; not the date of birth. Emailing stays off by default; an employee without the password gets only the in-app payslip. | My security has a "Payslip password" card: set, change or remove it (the sign-in password is asked first when the person has one); only an argon2 hash is kept. The date-of-birth default is removed. See the build note below. |

**Build note on 5d-D3 (answered by 5e-D1, §19.6).** A password-protected PDF can only be locked with the password itself (or key material derived from it with the PDF format's own hash); an argon2 hash cannot lock it. With only the hash stored, the server cannot produce the protected PDF when payslips are published. Until the founder chooses, emailing sends no PDF to anyone (people with the password set are counted as waiting); everyone gets the in-app payslip. Options: (a) also keep the password sealed with the company's encryption key, used only to lock emailed PDFs; (b) email a link to the in-app payslip instead of a PDF; (c) drop payslip email.

### 19.6 Batch 5e build decisions (founder, accepted 9 Oct 2026)

Raised while building batch 5e and accepted on 9 Oct 2026.

| # | Decision | What is built |
|---|---|---|
| 5e-D1 | **Payslip email (follow-up to 5d-D3): no PDF by email.** The email carries a link to the in-app payslip: sign-in required, an expiring single-purpose link, no pay figures in the email body. | When the company turns payslip email on, publishing emails each employee a link that opens only that payslip, only for that person once signed in, and expires. The payslip-password card, table and "waiting" count are removed by a forward migration (5d-D3's password is no longer needed). |
| 5e-D2 | **PAN status: recorded by payroll by hand, with a reason**, as built. A checking provider comes later. | `POST /tax/workspaces/{id}/pan-status` (`tax.proof.verify`, never one's own), audited; an inoperative or missing PAN is taxed at the higher rate, never blocked. |
| 5e-D3 | **DTAA: no treaty relief now.** Keep the stored data and flag such cases for payroll to handle by hand. | The treaty country and residency-certificate date stay on the workspace; a person with a treaty claim gets a run check and a note on the tax sheet that payroll handles it by hand. |

---

## 20. Go-live items this design adds

To add to [GO-LIVE-CHECKLIST.md](../GO-LIVE-CHECKLIST.md) (the coordinator edits that file):

| Item | What to do |
|---|---|
| Compliance owner + partner CA | Named YukthiX compliance owner (maker), second reviewer (checker), partner CA firm engaged for initial verification of the pilot states (P07 Q2 / Q7) |
| Verify flags cleared | PF, ESI, PT, LWF, minimum wage and TDS rule sets for the pilot states verified (§8.7, §19 D2) |
| FVU | Current FVU version downloaded from the official site into the worker image; a routine to update it when the government releases a new one |
| Bank sample files | One accepted sample upload per bank format before it is offered (§19 D1) |
| DSC | Signing route chosen (§19 D4); signing helper code-signed if option a |
| Filing partner | Partner chosen and contracted before public launch (M03 Q6 / Q7, §19 D3) |
| Parallel run | First live month in parallel; signed-off comparison (§16.4) |
| Pen test | Before the payroll pilot (existing item #10) |

---

## 21. Change log

| Date | Change |
|---|---|
| 9 Oct 2026 | First draft: payroll fit and run lifecycle, data model per batch, roles and keys, formula language, statutory engine, run engine, inputs, outputs, security, events, API, screens, test plan, 98 slices in 10 batches (5a–5j), stories to add, open decisions D1–D5. |
| 9 Oct 2026 | §19.1: batch 5a build decisions 5a-D1 … 5a-D4 accepted (signed-PDF checks, frozen dates blocked, alumni email, pay guard on compensation in 5b). |
| 9 Oct 2026 | §19.2: batch 5b build decisions 5b-D1 … 5b-D3 accepted (state minimum-wage tables, payslip languages, CCA roots as published data). |
| 9 Oct 2026 | §19.3–19.4: batch 5c build decisions 5c-D1 … 5c-D3 accepted (UP minimum wages and TN DA as open data items, skill class on the job, run rules stay verify); open data items listed. |
| 9 Oct 2026 | §19.4–19.5: batch 5d build decisions 5d-D1 … 5d-D3 accepted (generic bank format only and the pilot's bank as an open data item, penny drop by a second person, an employee-set payslip password); the hash-versus-PDF-lock question recorded as open. |
| 9 Oct 2026 | §19.6: batch 5e build decisions 5e-D1 … 5e-D3 accepted (payslip email as a link to the in-app payslip, PAN status by hand, no DTAA relief with cases flagged). |
