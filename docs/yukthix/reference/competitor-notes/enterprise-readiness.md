# Enterprise readiness: six areas (code audit, 17 Nov 2026)

Read-only audit of YukthiX on `test/yukthix-main`. Sizes: S, M or L.

| Area | Verdict |
|---|---|
| Audit and data history | **Ready (best area).** Bitemporal job, pay and org records enforced in the database; "as of" person and org views; a tamper-evident, hash-chained audit log; payslip snapshots with reproduce. |
| Absence rules depth | **Mostly ready.** Missing: accrual by service band (M); recalculation after back-dated policy versions (M); true-up of yearly credits after a mid-year move (S). |
| Payroll costing and GL | **Mostly ready.** Journal engine with cost-centre split, Tally XML and Zoho Books CSV. Missing: ledger mapping screen (S); department, location and project dimensions (M); SAP/Oracle formats and journal reversal (M); mapping as in force at run time (S); actuarial accounts mapped (S); inter-entity charges (L). |
| Retro pay and arrears | **Partly ready.** A strong worksheet engine (36 months, statutory shares, consent, maker-checker). Missing: auto-create from back-dated revisions, plus a create and bulk screen (M); back-dated template versions (M); section 89(1) / Form 10E relief (M). |
| Approval workflow rules | **Partly ready.** Engine is enterprise-grade (any, all, count or percent; delegation; escalation; history). Missing: a company editor for conditional routing (L, drawn in PLT-12); configurable payroll, pay and offer approvals, per entity (M); auto-approve or reject for HR types (S); department-head approver (S). |
| Position management | **Not ready.** No position record. Headcount plans exist. Missing: positions with IDs, position hierarchy, freeze, requisitions tied to positions, a position chart (L). |

## Live defect found
- Approved late attendance and LOP corrections (sources `late_request` and `hr`, created in `apps/api/src/payroll/periods.service.ts`) are never read by a payroll run.
- The run only reads `source: 'injury_leave'` (`apps/api/src/payroll/runs.service.ts:636`).
- The UI promises they reach payroll "as arrears or LOP reversal".
- Fix before any payroll pilot.

## Ranked gaps for a large Indian enterprise
1. Position management (L).
2. Approved LOP and punch corrections never paid (M, defect).
3. Conditional approval routing editor (L).
4. Auto arrears from back-dated revisions, plus a bulk screen (M).
5. GL mapping screen, dimensions, formats and reversal (M).
6. Section 89(1) / Form 10E (M).
7. Inter-entity charges (L).
8. Approval coverage: payroll, pay and offer approvals, per entity, auto actions (M).
9. Leave service bands and back-dated policy recalculation (M).
10. Headcount budget vs actual seats and cost (M), plus actuarial ledger codes (S).

## Already better than typical HRMS
- Bitemporal history, enforced in the database.
- A tamper-evident audit log with legal holds.
- Reproducible payslips.
- Automatic arrears proposals when statutory rules change.
- Careful arrears handling: statutory shares, consent, maker-checker.
- India leave law minimums by date.
- Locked periods that need a second sign-in to reopen.

## Oracle pass (later)
Focus only on positions, conditional approvals, GL and inter-entity, retro, absence service bands and multi-country
(entities, countries, currencies).
