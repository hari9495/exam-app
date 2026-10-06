# P15 · Migration, Implementation & Sandbox

> **Status:** ✅ Decided (6/6), 26 Sep 2026. **Market analysis addition (G11, 26 Sep 2026):** mappers for Freshteam, OrangeHRM, Horilla and a generic ATS CSV, plus a "Freshteam switch kit" page (YX-MIG-14; §11 G11). **Validation pass 3 Must J3, 28 Sep 2026:** month-wise **as-paid pay lines per component** for the current tax year are a required payroll import (older years optional) and are the arrears base across the go-live boundary (YX-MIG-15; M03 YX-PAY-52); §11 J3.
> **Covers:**
> - spec §2.1.11 (Import, Export & Data Migration — "a deal-closer in sales") and §2.1.19 (Sandbox Environment);
> - GAP-REGISTER **A5** (setup hub and go-live readiness are already done in APX-E; this doc adds the migration framework, history import, competitor mappers, implementation playbook, pilot exit criteria, tenant sandbox and demo data);
> - NFR rows 33, 37, 38, 40, 47.
>
> **Builds on:**
> - P01 (org import);
> - P06 (dated history, retro);
> - P07 (statutory IDs);
> - P08 (locks, audit);
> - P11 (API);
> - P14 (trial, D18 pricing: self-service included, custom work paid);
> - M01–M03 (employees, leave balances, YTD payroll);
> - APX-E (setup hub, readiness);
> - APX-F (templates).
>
> **Pricing note (D18):** everything self-service here is included in the $1 price. Hands-on migration by the YukthiX team is **customisation work** (paid extra).

---

## 1. Purpose & scope
A company should be able to move to YukthiX from:
- Excel;
- greytHR, Keka, Zoho, Darwinbox or Frappe HR;
- Freshteam (discontinued), OrangeHRM, Horilla or any ATS that exports CSV (G11);
- another system.

They should do it **by themselves, safely**:
- see exactly what will change before it happens;
- undo a bad import;
- test payroll in a sandbox;
- go live with a checklist.

At $1 per user, self-service onboarding is what makes the business model work.

## 2. What exists today (exam app and designs)

| Capability | Today | P15 |
|---|---|---|
| Imports | Scattered CSV / Excel imports in each design (M01 employee import, M03 opening YTD, M02 balance adjustment, P06 "import change", M05 / M07 §8), exam-app question and candidate bulk upload | **Unify** into one import framework (§3) |
| Setup & readiness | APX-E setup hub (22 cards) + 67 readiness checks | **Reuse**; P15 adds the migration cards and the playbook |
| Export | P14 whole-tenant export (YX-TEN-05) | **Reuse** (the same formats work for re-import) |
| Sandbox | P11 developer sandbox with demo data | **Extend** to a tenant sandbox (Q5) |
| Demo data | None | **Add** a generator |

## 3. Concepts
- **Import job:** one run of the importer for one entity set. It moves through **upload → map → validate → preview → commit → (rollback)**. It has an owner, a source file, the mapping used, a row-level result and an audit trail.
- **Entity templates:** a downloadable Excel template per importable entity, with column help, allowed values and examples. Covers:
  - org (entities, locations, departments, designations, grades, cost centres);
  - employees, employments, assignments, compensation;
  - bank / statutory IDs, family & nominees;
  - leave balances & ledger openings;
  - attendance history;
  - payroll **as-paid pay lines** per month and component (current tax year required for payroll go-live, earlier years optional; J3) & past payslips;
  - loans & advances;
  - assets;
  - documents (ZIP + index);
  - holidays, shifts, rosters;
  - candidates / jobs (ATS);
  - questions (Proctoring).
- **Source mappers:** saved column mappings for known source systems' standard exports (Q1), plus a custom mapping the user builds once and reuses.
- **Validation:** each row is checked for:
  - types and required fields;
  - references (the department exists, the manager exists, no cycles);
  - statutory formats (PAN, Aadhaar masked, UAN, IFSC, ESI IP);
  - duplicates (P01 code scope, YX-EMP-02);
  - effective-date overlaps (P06);
  - business rules (a leave balance within its policy limits, YTD totals consistent).

  Errors block the row; warnings need acknowledgement.
- **Preview:** a diff of what will be created, updated or skipped, with counts and a sample, before anything is written.
- **Rollback:** reverse a committed import batch (Q4).
- **History import:** how much past data comes in, and in what form (Q2):
  - as **data**, which is live and used for YTD, tax, leave and analytics;
  - or as **documents**, which are read-only archives such as past payslips and Form 16 PDFs.
- **Implementation playbook:** a guided plan in the app: phases, owners, due dates and sign-offs. It is fed by the APX-E readiness checks and ends in **go-live**.
- **Parallel run:** payroll computed in YukthiX alongside the old system for N months, with a variance report (M03 §8). The company decides N (D17); the starter template is 1 month.
- **Tenant sandbox:** a separate, isolated copy of the tenant for testing configuration and payroll (Q5).
- **Demo data generator:** creates a realistic fictional company:
  - org structure;
  - 12 months of attendance, leave and payroll;
  - hiring pipeline, cases, surveys.

  It is used for trials (P14 Q4), sales demos, the developer sandbox (P11) and automated tests.

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `import_jobs` | tenant, entity set, source (template / mapper id / custom), file ref, status, counts (created / updated / skipped / errors / warnings), owner, started / committed / rolled back at |
| `migration_connections` | tenant, source system, auth type (API key / OAuth), credential ref (encrypted), scope (read-only), last pull, status, auto-delete date |
| `import_mappings` | tenant (or platform for standard mappers), source system, entity, column → field map, transforms (date formats, code lookups), version |
| `import_rows` | job, row number, raw values (encrypted where sensitive), result (ok / warning / error), messages, target record ids |
| `import_batches` | committed batch, records written (for rollback), rollback eligibility, rolled back at |
| `implementation_plans` | tenant, phases, tasks, owners, due dates, status, sign-offs (links APX-E readiness) |
| `parallel_runs` | tenant, period, source system totals (uploaded), YukthiX totals, variance per employee / component, sign-off |
| `sandboxes` | tenant, type (Q5), created / refreshed at, data masking applied, status, expiry |
| `config_promotions` | sandbox → production: settings / templates / policies selected, diff, approver, applied at |

All tables carry `organization_id` + RLS. Import files and rows are purged after the retention period (default 90 days after commit), because they can contain Special data.

## 5. Rules (YX-MIG)

| ID | Rule |
|---|---|
| YX-MIG-01 | Every import goes through upload → map → validate → **preview** → commit. Nothing is written before the user confirms the preview. |
| YX-MIG-02 | Validation applies the same rules as the live forms and APIs (P11 YX-API-01): no import path bypasses statutory format checks, duplicate checks, P06 effective-dating or P02 permissions. |
| YX-MIG-03 | Row errors never abort the whole job. Error rows are downloadable as an Excel file with messages next to each cell, so the user can fix them and re-upload only those rows. |
| YX-MIG-04 | Committed batches can be rolled back per Q4. Rollback removes exactly the records the batch created and restores fields it updated; it is blocked once dependent records exist (e.g. a payroll run used them) or the period is locked (P08). |
| YX-MIG-05 | Imported history is marked with its source and import batch, and is effective-dated (P06). Opening balances (leave, YTD, loans) enter as ledger entries with reason "migration opening", never as silent overwrites. |
| YX-MIG-06 | Sensitive import data (bank, PAN, Aadhaar, salary) is encrypted at rest in staging, visible only to the importing admin, and purged after the retention period. |
| YX-MIG-07 | Documents are imported as a ZIP + index file mapping each file to an employee and document type (P05); unmatched files are listed for manual assignment. |
| YX-MIG-08 | Payroll go-live requires either a completed parallel run with variance signed off, or an explicit, audited waiver by the Payroll Admin (D17: the company decides the number of months). |
| YX-MIG-09 | A sandbox never sends real notifications, bank files, filings or partner calls (all outbound channels are stubbed), and its data is masked per Q5. |
| YX-MIG-10 | Configuration moves from sandbox to production only through a reviewed **promotion** (diff + approver, P03), never by copying data. |
| YX-MIG-11 | **Direct API pull connectors** (Q1): the customer connects its own account on the old system (API key or OAuth consent) with **read-only** scope; data is pulled into the same staging → validate → preview → commit pipeline (never written directly); pulls can repeat during the parallel run; stored credentials are encrypted, limited to the migration, and **deleted automatically** when migration is marked complete or after 90 days; where a vendor offers no suitable API or its terms forbid it, the file mapper is used. |
| YX-MIG-12 | **Full-history import** (Q2 option): past financial years imported as data are loaded as **closed and locked periods** (P08 status *filed / locked*), marked with their import batch, never recalculated by the payroll or leave engines, and used for reports, analytics, employee history and statutory look-ups; storage beyond fair use counts toward the storage add-on (D18). |
| YX-MIG-13 | Public launch is gated on the Q6 pilot exit criteria, tracked in the platform console (P14) with evidence per criterion (variance reports, portal acknowledgements, incident register, readiness scores, customer sign-offs). |
| YX-MIG-14 | **ATS and open-source HR mappers (G11):** ready file mappers (Q1 pipeline, YX-MIG-01–07) for **Freshteam**, **OrangeHRM** and **Horilla** standard exports and a **generic ATS CSV** template covering candidates, jobs, pipeline stages (mapped to the M10 stage set), notes and attachments (ZIP + index, YX-MIG-07); a public **"Freshteam switch kit"** page (export steps from Freshteam, field map, what carries over, what to check) is linked from the setup hub and the website. Included in the price (D18). |
| YX-MIG-15 | **As-paid pay lines (J3):** payroll go-live needs, for every employee paid in the current tax year before go-live, the **as-paid lines per month and per component** (earnings, deductions, employer contributions, TDS, PF / ESI wages) — not only YTD totals; YTD for tax (M03 YX-TAX-15) is derived from them. Validation checks each month's lines add up to the imported net and statutory totals. They load as imported payslips in locked periods (`source = import`, import batch; never recalculated, YX-MIG-12) and are the as-paid base for arrears on back-dated revisions effective before go-live (M03 YX-PAY-52, labelled "based on imported figures"). Earlier years are optional (Q2); a month without imported lines is flagged in the readiness checks, and any arrears reaching it need HR to confirm the base. |

## 6. Flows
1. **Self-service migration (setup hub card "Bring your data"):**
   1. Pick the source (Excel template / known system / custom).
   2. Download the template or upload the source export.
   3. Map columns (auto-suggested for known mappers).
   4. Validate.
   5. Fix errors.
   6. Preview.
   7. Commit.
   8. Repeat per entity in dependency order: org → employees → compensation → balances → history → documents.
2. **Payroll cut-over:**
   1. Import month-wise as-paid pay lines for the current tax year up to the last closed month (YX-MIG-15); YTD is derived from them.
   2. Parallel run for N months with variance review.
   3. Sign-off.
   4. Go live.
   5. Old system switched off.
3. **Assisted migration (paid customisation, D18):** the YukthiX team runs the same framework on the customer's behalf under a P02 support session, with the customer signing off each preview.
4. **Sandbox:**
   1. Create or refresh the sandbox (Q5).
   2. Test settings and a payroll run.
   3. Promote the chosen configuration to production (YX-MIG-10).
5. **Implementation playbook:**
   1. Phases: kick-off, set-up, data, parallel run, training, go-live, hypercare.
   2. Tasks auto-created from APX-E readiness.
   3. Owner sign-offs.
   4. Go-live date locked.
   5. Hypercare for 30 days.

## 7. UI
- **Setup hub › Bring your data:** a wizard (T4), mapping screen with suggestions, validation grid with inline errors, preview diff, commit, import history with rollback.
- **Implementation plan** (T6): phases, tasks, owners, dates, readiness score.
- **Parallel run report:** variance per employee and component, drill-down, sign-off.
- **Sandbox bar:** a clear "SANDBOX" banner and colour on every screen, refresh and promote actions, and an expiry notice.

## 8. Migration & rollout
- The framework ships in **wave 1** (org + employee imports), growing each wave with its module's templates.
- **Wave 3:** payroll YTD, past-payslip archive and parallel run — pilot-critical.
- Known-system mappers are added per Q1, and more as customers arrive. Freshteam, OrangeHRM, Horilla and the generic ATS CSV mappers (YX-MIG-14) ship with the ATS product; the Freshteam switch kit page before public launch.
- Sandbox per Q5 by the wave-3 pilot.
- Demo-data generator by the public-launch trial.

## 9. Acceptance tests (samples)
- Importing 500 employees where 12 rows have bad PANs creates 488 and returns an error file with the 12 rows and messages (YX-MIG-03).
- Nothing is written until the preview is confirmed (YX-MIG-01).
- Rolling back an employee import with no dependants removes exactly those employees; after a payroll run has used them, rollback is blocked with the reason (YX-MIG-04).
- Leave balances imported for 200 employees appear as "migration opening" ledger entries (YX-MIG-05).
- A payroll run in the sandbox produces no bank file or notifications (YX-MIG-09).
- Promoting a leave-policy change from sandbox shows a diff and needs approval (YX-MIG-10).
- A greytHR employee export maps automatically, with no manual column matching (Q1).
- A Freshteam candidate export with notes and attachments lands as M10 candidates in the mapped stages, with each attachment on the right candidate (YX-MIG-14).
- A company going live on 1 Oct imports April–September as-paid lines per component; a month whose lines don't add up to the imported net is an error row; the imported months appear as locked, imported payslips and a 1 Jul revision computes arrears from them (YX-MIG-15; J3).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Which source systems get ready-made mappers at launch? | **Excel templates for everything + ready mappers for greytHR, Keka, Zoho People / Payroll, Darwinbox and Frappe HR** (from their standard export files, no screen-scraping); mappers for others added as customers ask (built once, then free for all). |
| Q2 | How much history to import? | **As data:** current state + **current financial year** (payroll YTD per month, leave ledger openings, attendance for the current month, open loans / advances / cases); **as documents:** up to **7 years** of past payslips, Form 16 and letters as read-only PDFs in each employee's vault. |
| Q3 | Who does the migration? | **Self-service included** (wizard + templates + mappers + help); **assisted migration by YukthiX = paid customisation work** (D18), quoted per customer. |
| Q4 | Undoing an import | **Rollback per batch for 30 days**, as long as nothing depends on it yet (no payroll run / locked period); after that, corrections go through normal edits. |
| Q5 | Tenant sandbox | **One sandbox per tenant, included:** a copy of the configuration + **masked** employee data (names, IDs, bank replaced), refreshable on demand, outbound channels stubbed, expires after 90 days idle; **larger / extra sandboxes as a storage add-on**. |
| Q6 | Pilot exit criteria (before public launch) | Pilot customers run **3 consecutive live payroll cycles** with **zero unexplained variance**, statutory files (PF ECR, ESI, TDS) **accepted by the portals**, **no Severity-1 incident in the last 30 days**, readiness checklist complete, and each pilot customer signs off. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Excel templates for everything + ready file mappers for greytHR, Keka, Zoho People / Payroll, Darwinbox, Frappe HR + direct API pull** from those systems where their APIs and terms allow (customer's own read-only credentials, auto-deleted after migration, same validate / preview pipeline, YX-MIG-11); more systems added on request, built once, free for all. Team action: check each vendor's API availability and terms. | 26 Sep 2026 |
| Q2 | **Company chooses:** default = current state + **current financial year as data** (monthly payroll YTD, leave openings, current-month attendance, open loans / advances / cases) + up to **7 years of past payslips, Form 16 and letters as read-only documents**; **optional full history as data** for earlier years, loaded as closed / locked periods, never recalculated (YX-MIG-12); storage beyond fair use → storage add-on. | 26 Sep 2026 |
| Q3 | **Self-service migration included** (wizard, templates, mappers, API pull, guides); **assisted migration by the YukthiX team = paid customisation work** (D18), quoted per customer, run under a P02 support session with customer sign-off on every preview. | 26 Sep 2026 |
| Q4 | **One-click rollback per batch for 30 days**, only while nothing depends on it (no payroll run used it, no locked period); afterwards corrections through normal edits (YX-MIG-04). | 26 Sep 2026 |
| Q5 | **One sandbox per tenant included:** copy of configuration + **masked** employee data (names, IDs, bank replaced), refresh on demand, all outbound channels stubbed (YX-MIG-09), expires after 90 days idle; configuration moves to production only by reviewed promotion (YX-MIG-10); **extra or larger sandboxes = storage add-on** (D18). | 26 Sep 2026 |
| Q6 | **Pilot exit criteria for public launch:** pilot customers complete **3 consecutive live payroll cycles** with **zero unexplained variance** vs their previous system; **PF ECR, ESI and TDS files accepted** by the portals; **no Severity-1 incident in the last 30 days**; readiness checklist complete; each pilot customer signs off. New rule YX-MIG-13. | 26 Sep 2026 |
| G11 | **Market analysis addition (G11), founder decision: migration mappers for Freshteam, OrangeHRM, Horilla and a generic ATS CSV** (candidates, jobs, stages, notes, attachments) plus a public "Freshteam switch kit" page. New rule YX-MIG-14; §1, §8. | 26 Sep 2026 |
| J3 | **Validation pass 3 Must (J3), founder decision 28 Sep 2026 (option A):** migration imports **month-wise as-paid pay lines per component** for the current tax year (already needed for YTD tax; older years optional); they load as locked imported payslips and are the base for arrears on back-dated revisions effective before go-live, labelled "based on imported figures"; where a month's lines are missing, the arrears worksheet asks HR to confirm the base (M03 YX-PAY-52). Import templates and flow 2 updated. §3, §6, YX-MIG-15. | 28 Sep 2026 |
