# Review of the E2 and E3 build plans (approval rules editor and back-dated pay)

27 Nov 2026. A read-only review of the plan text in compare-summary.md (lines 481–514, answers 2640–2658) against the code on `test/yukthix-main`. No code was changed and nothing heavy was run.

**Main conclusion.** The P03 engine is a good base for E2. But the plan assumes three things the code does not do:
1. A company's rule replaces the module's own steps; it does not add to them.
2. Arrears and salary revisions are engine request types; they are not.
3. Past requests keep their attribute values; they do not.

E3 would automate an arrears path that can already pay the same money twice. That path needs fixing before anything drafts worksheets automatically.

---

## E2. Approval rules editor

### Must-fix in the plan

1. **A company rule replaces the module's steps, so the "locked floors" do not exist in code today.**
   - `workflow/approvals-engine.service.ts:410-413` uses the company's own steps (`own`) instead of `input.steps`.
   - This already drops built-in steps today. If a company saves an `expense.claim` policy, the cost-centre owner and finance-check steps listed in `approval-policies.ts:77` disappear.
   - E2 would lose the same way:
     - the requisition's "Outside the plan" and "Recruiting" steps (`hiring/requisitions.service.ts:515-516`), which breaks answer 2643;
     - the offer's above-range step, which needs a holder of the pay key (`offers/offer-builder.service.ts:236-244`).
   - Smallest change: the module passes its mandatory steps as `required: true`, and the engine always adds them after the company's steps. The editor shows them as locked steps. Add a test per type that a saved rule cannot remove them.

2. **Pay types work out their approvers in ways a rule cannot repeat.**
   - `payroll/runs.service.ts:1336-1343`: a payroll run removes every maker of its inputs (LOP, special days, one-time pay) and everyone the run pays.
   - Example: a rule "holders of payroll.run.approve in entity A" would let Priya approve a run that pays her own salary, or that includes LOP rows she entered.
   - Smallest change: keep `payroll.run`, `payroll.period_reopen`, `payroll.correction`, `payroll.payment_mode` and `payroll.reports_access` read-only in the editor ("built in, cannot change"). Allow only add-on steps for the other pay types.

3. **Self-approval: the floor contradicts existing code.**
   - `payroll/runs.service.ts:1352-1356`: when nobody else holds the key, the preparer may approve their own run (P02 Q6, with a reason).
   - The engine also accepts `selfApproval: 'allowed'` from step input (`approvals-engine.service.ts:225-228`).
   - Smallest change: the editor never offers self-approval, and only a module's built-in sole-approver path can use it. Strip `selfApproval` from anything saved through the editor.

4. **Separation of duties: an HR Admin could take over pay approvals.**
   - `workflow/approval-policies.controller.ts:35`: saving any policy needs only `org.settings.manage`.
   - Once pay types are in the list, an HR Admin with no pay keys could route one-time pay or loan approvals to themselves or to a named friend. Step-up confirms identity, not authority.
   - Smallest change: editing a Pay-group type also needs that area's approve key in every entity it covers. On save, refuse any named user or group member who does not hold the type's approve key.

5. **Pay revisions and arrears are not engine request types.**
   - Job and salary changes are an inbox source (`employee-history/employee-history.service.ts:169`), not a registered type.
   - Arrears worksheets are approved directly by `approveWorksheet` (`payroll/arrears.service.ts:412-418`).
   - The plan names `org.position.change`, but the code key is `org.position_change` (`positions/positions.service.ts:25`).
   - Smallest change: drop revisions and arrears from the editor's list, or size "move them onto the engine" as its own item. Fix the key name.

6. **"Try it" on real requests and the impact preview have no data to run on.**
   - `WfRequest` (`schema.prisma:5644-5667`) stores the title, summary and frozen steps. It stores neither the payload (amount, grade, entity) nor the policy version that routed it.
   - Smallest change: add `payload Json` and `policyVersion Int` to `wf_requests`. "Try it" works on typed sample values, plus requests made after the column exists. Cut the open-requests impact count.

### Should

7. **Someone who loses the key can still decide a frozen task.**
   - `decide()` checks only that the caller holds the task (`:540`).
   - These paths add approvers with no key or limit check: delegation (`:385-393`, `:471-485`; leave delegates to the manager by default, `:739`), escalation (`:672-678`) and reassign (`:859-879`).
   - Change: for steps built from key or limit kinds, store the requirement on the frozen step. Re-check it at decide, delegation, escalation and reassign, and fall back to the step's fallback approvers if it fails.

8. **"Holders of a key in this entity" is wider, and less stable, than the plan expects.**
   - `payHolders` (`payroll/pay-access.ts:134-147`) includes company-wide base-profile holders.
   - It stops at 25 people with no ORDER BY, and user groups do the same (`approvals-engine.service.ts:363`).
   - Change: scoped grants first, company-wide holders only as a fallback. Add ORDER BY. Refuse "all" or "count" on a derived group that can exceed 25.

9. **Walking up the manager chain until a limit.**
   - The walk caps at level 3 (`:177`), and the raiser is filtered out *after* resolving (`:419`). Example: a manager raising an ₹80 k claim for her report, with a ₹1 L limit, empties the step and it falls to HR.
   - Grade rank is not unique and can be entity-only (`schema.prisma:3067-3075`).
   - Change: skip excluded people and keep walking; cap at about 8 levels with a loop guard; compare ranks within the request's entity; refuse to save on ties.

10. **Moving the old chains changes routing silently.**
    - The old resolver walks `users.managerId` (`approvals/approver-resolver.ts:8-15`); the engine walks employee assignments (`:328-341`).
    - The old code skips empty steps; the engine falls back or throws `NO_APPROVER` (`:424`).
    - Change: a per-company dry-run report of old versus new approvers. Move a company only where they match, and list the rest for HR.

11. **Notice text.** Never merge the request summary into notices (exits keep cards neutral, `lifecycle/exits.service.ts:110`). Use merge fields for title, requester, step and link only, and HTML-escape them.

12. **A position can have several holders.** State "any one of its holders", or allow only seats with headcount 1.

### Nice
- Check that a group exists in the company when the rule is saved.
- Use one function for the offer route preview (`offer-builder.service.ts:254`), "Try it" and submit.

### Sound
- **Two approvers acting at once:** safe. `FOR UPDATE`, a status and step re-check, and the finish guard (`:541-544`, `:494-495`).
- **Rule changed mid-flight:** safe. Steps are frozen at submit.
- **Rule edits:** an advisory lock, a version check and an audited before-and-after.
- **F3/F4:** still hold (`:900-906`, `:419`).
- **Cross-company resolution:** every resolver filters by company, and RLS applies.

### Cut
- The `approval_policy_versions` table: use the version counter and audit, plus `policyVersion` on the request.
- PLT-33 open-request impact counts.
- Position-holder approvers, until a customer turns positions on.
- Per-type notice text, except for the two hiring types.

### Build order
1. Engine changes: required steps, the self-approval rule, and the `payload` and `policyVersion` columns.
2. Re-checks at decide, delegation, escalation and reassign.
3. The new approver kinds and the limits table.
4. Widen the type list, with pay types locked.
5. The editor and "Try it".
6. The chain dry-run, the move, and the Hiring › Approvals re-wire.
7. Notices.
8. Drop the old tables in a later release.

---

## E3. Back-dated pay

### Must-fix in the plan

1. **The same arrears can be paid twice today. Automation would make it common.**
   - `arrears.service.ts:295-320`: the as-paid amount counts the regular payslip plus *approved* worksheets only.
   - Open drafts are not counted, nothing is recalculated at approval (`:412-420`), and manual drafts have no overlap check.
   - Example: a manual Oct–Dec worksheet (+₹6,000) and a system draft for the same months, both approved, pay ₹12,000.
   - Change: a per-employment advisory lock when creating any worksheet; refuse an overlap with an open draft; recalculate at approval, or refuse if an overlapping worksheet was approved after this draft was made.

2. **The LOP trigger repeats what late-corrections already pays.**
   - `late-corrections.ts:7-15`: a late attendance fix is already paid as one-time pay in a later run.
   - Change: remove "LOP change" from the switches. This changes answer 2651.

3. **Who counts as the maker of a system draft.**
   - Maker-checker compares `createdBy` (`:418`).
   - Change: a system draft's `createdBy` is the user whose change fired the trigger, so they can't approve their own arrears.

4. **Approving while the month's run is open can lose the payment.**
   - `approveWorksheet` writes one-time pay without the cut-off roll (`:444-461` vs `inputs.service.ts:183-197`) and only checks for locked or filed months (`:436-437`). A run picks up only its own month's items (`runs.service.ts:794-796`).
   - Example: the November run is calculated on 26 Nov, a draft is approved on 28 Nov, and the run is approved on 29 Nov. The arrears are never paid.
   - Change: use the same cut-off roll. Refuse to pay into a month whose run is calculated or in review, or mark that run for recalculation.

5. **Statutory rule changes should not auto-draft.**
   - Rule sets are shared by every company. The existing proposal path (`:508-595`) already shows a preview, and a company user accepts it as the maker.
   - Change: keep that path, and add the total and the largest change to its list.

### Should

6. **Big triggers as background jobs.** `accept()` drafts everyone in one transaction with a 120-second limit (`:564-585`). Change: a BullMQ job in chunks, keyed on the change id; the impact preview uses the same job.

7. **ESI contribution periods.** First-month coverage is taken from today's wage (`runs.service.ts:997-1008`), so a back-dated raise can wrongly refund April's ESI. Change: for arrears, take coverage from the approved payslip of the period's first month.

8. **PF may be counted twice.** Earnings arrears are paid as one-time pay "so PF, ESI and tax follow their flags" (`arrears.service.ts:20-25`), while the worksheet's PF difference also goes into a recovery (`:425-442`). Change: confirm with a test; statutory lines come from one place, never both.

9. **Discard reason.** `cancelWorksheet` takes no reason (`:494-503`). Change: add a required `discardReason` and a `discarded` status. A re-draft must not wipe hand-confirmed base amounts (`:391-409`).

### Sound
- TDS is taxed when paid (`:40`), which is correct across a financial year end.
- Filed months cannot be paid into.
- Recoveries need consent.
- "A trigger only drafts" fits the existing maker-checker.

### Cut
- The mid-year PF ceiling and tax projection true-up.
- The LOP and statutory triggers. That leaves salary change and joining date.

### Build order
1. Fix the arrears core: lock, overlap check, recalculate at approval, maker rule, cut-off and run guard, discard reason.
2. Settle the ESI and PF questions with tests.
3. Per-component switches.
4. The salary-change trigger as a job.
5. The policy-change preview on the same job.
6. Totals on the statutory proposals.

No tests were run. The PF point (E3 item 8) is read from code and comments and needs a test to confirm.
