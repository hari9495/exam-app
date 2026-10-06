# Frappe HRMS — Functional Reference for YukthiX

**Purpose.** A plain-language catalogue of every feature, rule and calculation in the open-source Frappe HR (and India Payroll) apps, so the YukthiX team knows what a mature HRMS does, what we already plan, and what we are missing.

**Started:** 23 September 2026

---

## Clean-room rules (read before editing)

Frappe HR and India Payroll are licensed **GPL-3**. YukthiX is a closed-source rewrite. To keep it that way:

| Allowed in these documents | Not allowed |
|---|---|
| What a feature does, who uses it, when | Source code, pseudo-code that mirrors their code |
| Business rules written in our own words | Their function, class or variable names |
| Formulas as maths, with worked examples | Copied error messages or UI text |
| Status flows, settings, reports | Their code structure or file layout as our design |
| Source file path, for later verification only | |

- YukthiX developers build **from these documents**, not from the Frappe source.
- To verify behaviour, compare **outputs**: run the same scenario on the local Frappe instance (`hrms.localhost`) and on YukthiX. Do not compare code.
- Statutory rules (PF, ESI, PT, TDS, gratuity, maternity) are verified against **the law and government notifications**, not against Frappe.

## Per-feature template

Each feature section follows this order. Sections with nothing to say are skipped.

1. Purpose and YukthiX mapping (§ in `spec.md`)
2. Who uses it
3. Data captured
4. Status flow
5. Rules (numbered, e.g. `LV-APP-07`) — each rule is a future acceptance test
6. Calculations with worked examples
7. Side effects
8. Settings that change behaviour
9. Reports
10. Gap vs YukthiX — ✅ in our spec · ❌ missing · 💡 we can do better
11. Source pointer (file path)

## Data dictionaries

Each module has a companion `NN-*.data-dictionary.md`: every data object and field (plain label, type, options, default, required / read-only / editable-after-submit, show/require conditions), generated from the reference field definitions by `../tools/build_dd.py`. Labels only — no internal names or help text.

## Modules

| # | Module | Source | YukthiX § | Status |
|---|---|---|---|---|
| 00 | [Core HR Masters (Employee, Department, Designation, Branch, Holiday List)](00-core-hr-masters.md) | erpnext/setup | 1.3.1, 2.1.1 | Drafted |
| 01 | [Leave Management](01-leave-management.md) | hrms/hr (leave, holiday) | 1.3.3 | Done — 6 design decisions recorded · [UI reference (pilot)](01-leave-management.ui-reference.md) |
| 02 | [Attendance, Shifts & Overtime](02-attendance-and-shifts.md) | hrms/hr | 1.3.4 | Drafted — 8 design questions open · [UI reference](02-attendance-and-shifts.ui-reference.md) |
| 03 | [Payroll Engine](03-payroll-engine.md) | hrms/payroll | 1.3.5 | Drafted — 8 design questions open · [UI reference](03-payroll-engine.ui-reference.md) |
| 04 | [India Statutory (PF, ESI, PT, LWF, TDS 24Q, Form 16)](04-india-statutory.md) | india-payroll | 1.3.5 | Drafted — 6 design questions open · [UI reference](04-india-statutory.ui-reference.md) |
| 05 | [Employee Lifecycle (onboarding, promotion, transfer, separation, F&F)](05-employee-lifecycle.md) | hrms/hr | 1.3.1, 1.3.2, 1.3.13 | Drafted — 7 design questions open · [UI reference](05-employee-lifecycle.ui-reference.md) |
| 06 | [Expenses, Advances & Travel](06-expenses-advances-travel.md) | hrms/hr | 1.3.7 | Drafted — 6 design questions open · [UI reference](06-expenses-advances-travel.ui-reference.md) |
| 07 | [Performance (appraisal, goals, feedback)](07-performance.md) | hrms/hr | 1.3.8 | Drafted — 6 design questions open · [UI reference](07-performance.ui-reference.md) |
| 08 | [Recruitment (maps to Internal ATS)](08-recruitment.md) | hrms/hr | 1.2.2 | Drafted — 6 design questions open · [UI reference](08-recruitment.ui-reference.md) |
| 09 | [Training, Grievance & Other Features](09-training-grievance-misc.md) | hrms/hr | 1.3.9, 1.3.12, 1.3.15 | Drafted · [UI reference](09-training-grievance-misc.ui-reference.md) |
| 10 | [Mobile App (PWA)](10-mobile-pwa.md) | frontend, hrms/api | 2.1.18, 1.3.11 | Drafted — 5 design questions open · [UI reference](10-mobile-pwa.ui-reference.md) |
| 11 | [Analytics (report builder, dashboards, schedules, metric dictionary)](11-analytics.md) | frappe framework + all HR reports | 1.4 | Drafted — functional + UI in one doc; 6 design questions open |
| 99 | [Gap summary](99-gap-summary.md) + [gap register](99-gap-register.md) | all modules | all | Done — priorities to confirm |
| 99 | [UI summary & design-system brief](99-ui-design-brief.md) | all UI references 01–10 | D13 | Done — 5 team decisions open |

## Not in this codebase

- **Employee master, Department, Designation, Branch, Holiday List** — from ERPNext (`Downloads\erpnext-develop`), documented as module 00. Company (mostly accounting) is not documented.
- **India statutory logic** — lives in `india-payroll`, documented as module 04.
