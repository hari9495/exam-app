# M06 · Performance

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026:** career paths & IDPs, talent pools / succession link, attrition-risk signal (GAP B16); pay-equity analysis and compensation benchmarking (GAP C3); §11 B16 / C3.
> **Covers:** spec §1.3.8:
> - goals and OKRs;
> - staged review cycles, with a manager rating separate from peer feedback;
> - 360° feedback with nominated reviewers;
> - competency framework;
> - calibration and 9-box;
> - ratings linked to increments, bonus and promotion;
> - PIP.
>
> Also covers Frappe reference [07](../reference/frappe-hrms-functional-spec/07-performance.md) (defects PF-D1…D7, questions 1–6) and UI reference 07 (U69–U76).
> **Build wave:** 5. Basic (guided) calibration was deliberately moved to wave 5 by Q5; only the 9-box and enforced distribution remain in wave 6 (spec §4).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Dotted-line managers | Can see and give feedback; don't approve | M01 Q5 |
| Probation review | Handled in M01 (confirm / extend / terminate). It **reuses this module's review form engine** | M01 Q3 |
| Promotions and compensation changes | Dated facts through a P03 request | P06, M01 |
| Stage workflow and deadlines | P03 engine; reminders and escalation | P03 Q2 |
| Recognition | Kudos live in Engage (wave 5) and are shown in reviews | spec §1.3.16 |
| Visibility | Ratings are **Confidential**: the employee, their manager chain and HR in scope only; managers don't see team salaries unless enabled, except inside a comp review they own (Q6) | P02 |
| Analytics | Rating distribution, completion and manager comparison in P09, with small-group suppression | P09 |
| Succession | Critical positions and successors with readiness live in M01 (Q8); this module feeds them from talent pools and IDPs (YX-PERF-16) | M01 Q8 |
| AI data tiers | Special data never goes to external AI; Confidential values masked unless approved; every AI output is advisory | P10 Q2, YX-AI-01/02 |

---

## 1. Purpose & scope
Help employees know what's expected, get regular feedback, and be reviewed fairly. Turn the outcome into pay and growth decisions with a clear trail.

## 2. What exists today (exam app)
There is no performance module. We reuse:
- the approval engine (stages);
- forms and custom fields;
- the **assessment engine (§1.1)**, for skills tests linked to competencies;
- notifications;
- the audit log.

## 3. Concepts
- **Goal:** an OKR objective with measurable **key results** (start, target, actual, unit), or a KPI / KRA with a target. Goals have:
  - an owner, which can be a person, team or company;
  - an optional parent owned by *anyone*, so goals cascade and align across people (fixes U70);
  - a weight and a period;
  - check-ins.

  Progress is calculated from the key results (fixes U71).
- **Check-in / 1-on-1:** a short periodic update on goals and a notes thread between the employee and their manager. A 1-on-1 has a shared agenda, shared notes, private notes (per author) and action items that can link to goals.
- **Manager change mid-cycle:** when an employee's manager leaves or changes (M01), every in-flight artefact gets a new owner (YX-PERF-13). The new manager gets a cycle-scoped read-back of their new reports' current cycle (P02 exception), in spite of time-bound visibility (YX-SEC-06).
- **Review cycle:** a period, population rules, a template, stages with deadlines, and a rating scale. It can be annual, half-yearly, quarterly, project or probation. Cycles may overlap when their types differ (fixes PF-D4).
- **Review template:** sections for goals, competencies, values, open questions and an overall rating, each with a weight. The final-score formula is validated when saved, never at run time (fixes PF-D7).
- **Stages:** set in Q2. Each stage has an owner, a deadline and a visible "next step" (fixes U73, PF-D5).
- **360° feedback:** nominated reviewers only (fixes PF-D1). The anonymity rules are set in Q4.
- **Calibration:** the adjustment of manager ratings across a group, with a reason (Q5).
- **Compensation review:** a proposal from rating to increment, bonus or promotion (Q6).
- **PIP:** a performance improvement plan (Q7).
- **Competency:** a skill or behaviour with proficiency levels, mapped to a role or designation (Q8).
- **Career path (B16):** company-defined moves from one designation to the next (vertical or lateral), each with the competency levels required and a typical time in role. YukthiX ships a labelled **starter template** (e.g. individual contributor and manager tracks) the company edits (D17). An employee sees the next roles on their paths and their gap against each.
- **Individual development plan (IDP, B16):** one plan per employee per period with items of five kinds: **goals** (linked to M06 goals), **competencies to build** (target level), **courses** from the M07 catalogue (creates an M07 enrolment request), a **mentor** (a colleague who accepts), and free-text **actions**. It has check-ins with the manager (reusing 1-on-1s) and a status per item.
- **Talent pool (B16):** a named, Confidential group such as "high potential" or "future leaders", filled from the 9-box / calibration or by HR nomination. Pool members can be proposed as successors for M01 critical positions.
- **Attrition-risk signal (B16):** an advisory band (low / medium / high) per employee with its top contributing factors, shown **to HR only**. It never triggers any action (YX-PERF-17).
- **Pay-equity analysis (C3):** pay-gap figures by gender, grade, role and location inside a comp review, before and after the proposals (YX-PERF-18).
- **Market benchmark (C3):** market pay ranges (P25 / P50 / P75) per job, grade and location, from a partner data feed (add-on) or the company's own survey upload, shown in the comp review (YX-PERF-19).
- **Company skills library (T2).** **One skills library per company, owned by this module**: the YukthiX starter taxonomy (labelled starter template, D17) plus the company's own skills, domain → skill → sub-skill with proficiency levels. Three **mapped views** read it: **competencies** (this module), **question tags** (T01 YX-QB-16) and **hiring scorecard skills** (M10). Each person has a **skill profile**; AI **suggests** skills from CVs, test results, projects (M12) and completed courses (M07), and the employee or manager **confirms** before a suggestion joins the profile.
- **Cycle eligibility (J11).** Each review cycle has a **joining cut-off**, rules for **mid-cycle joiners** (goals for the part served), **leavers**, **entity or manager transfers** (input from both managers) and people on **maternity or long leave** (no adverse treatment), and **increment proration** by eligible months.
- **Own pay band (T4).** An employee sees the **pay range of their own grade** (P01 `grade_pay_ranges`) and where they sit in it, never peers' pay: a company setting with the starter template **ON** (D17), always on where the law requires. The pay-gap engine (YX-PERF-18) also feeds the legal **gender pay-gap reports** and the employee **right-to-information** answer through report hooks.

## 4. Data model (main tables)

| Area | Tables |
|---|---|
| Goals | `goals` (owner_type person / team / company, owner_id, parent_goal_id, type okr / kpi, weight, period, status), `key_results` (start, target, actual, unit, direction), `goal_checkins` |
| Check-ins | `one_on_ones` (employee, manager, date, agenda, shared notes, action items linked to goals; private notes per participant) |
| Ownership | `perf_owner_transfers` (employee, old manager, new manager, effective date, artefact type / id, from → to owner, by, reason) |
| Cycles | `review_cycles` (type, period, population rule, template version, scale, stage config), `review_participants` |
| Reviews | `reviews` (cycle, employee, current stage, scores per section, final score, band, calibrated score + reason, released_at), `review_stage_entries` (stage, author, ratings, comments, submitted_at) |
| Feedback | `feedback_nominations` (reviewer, relationship, status), `feedback_responses` (anonymity mode stored), `quick_feedback` (anytime praise / suggestion, visibility) |
| Calibration | `calibration_sessions` (group, facilitator, distribution guide), `calibration_changes` (review, from → to, reason, by) |
| Compensation | `comp_review_cycles` (period, population, **department budgets**: per department / cost centre the budget amount, currency, used = Σ approved increment cost annualised, remaining = budget − used; feeds APX-C `comp.increment_budget_vs_plan` and RPT-PERF-05), `comp_matrix` (rating band × compa-ratio / position → % range), `comp_proposals` (employee, current, proposed increment / bonus / promotion, justification, status → P06 change) |
| PIP | `pips` (employee, reason, goals, support, start, end, check-ins, outcome) |
| Competencies | `competencies`, `competency_levels`, `role_competency_map`, `competency_ratings` |
| Career & IDP (B16) | `career_paths` (name, track, starter-template flag), `career_path_steps` (from designation → to designation, move type vertical / lateral, required competency levels, typical months in role), `career_aspirations` (employee, target designation / path, timeframe, visible to manager y/n), `idps` (employee, period, status draft / approved / active / closed, approved_by), `idp_items` (kind goal / competency / course / mentor / action, goal_id?, competency_id + target level?, course_id + M07 enrolment_id?, mentor_employee_id?, due, status, progress), `idp_checkins`, `mentorships` (mentor, mentee, IDP, status requested / accepted / declined / ended) |
| Talent (B16) | `talent_pools` (name, purpose, owner, visibility), `talent_pool_members` (pool, employee, source 9-box / calibration / nomination, reason, added_by, readiness, linked succession_candidate_id in M01) |
| Attrition risk (B16) | `attrition_risk_scores` (employee, as_of, band, score, top factors with direction, model version, features used), `attrition_risk_views` (viewer, employee, at — audit) |
| Pay equity & market (C3) | `pay_equity_runs` (comp cycle, dimensions, measure mean / median, raw and adjusted gap, pre / post proposals snapshot, suppression applied, run by / at), `market_benchmark_sources` (partner feed / company upload, licence, effective date), `market_benchmarks` (source, job code, grade, location, currency, P25 / P50 / P75, effective date), `benchmark_job_mappings` (designation / grade / location → source job code, mapped by) |
| Skills library (T2) | `company_skills` (domain → skill → sub-skill, levels, starter flag, status active / retired / merged_into), `skill_mappings` (view competency / proctoring_tag / scorecard, source id → `company_skill_id`), `person_skills` (person, skill, level, source self / manager / test / course / project / cv, evidence ref, `suggested_by_ai`, status pending / confirmed / rejected, confirmed by / at) |
| Cycle eligibility (J11) | `review_eligibility` (cycle, employee, rule applied included / excluded_cutoff / leaver / transfer_split / protected_leave, eligible months, proration factor, override reason, by) |

All tables carry `organization_id` + RLS. Ratings, calibration, PIP and comp proposals are **Confidential**. IDPs follow the review visibility (employee, manager chain, HR; a mentor sees only the items they are named on). Talent-pool membership, attrition-risk scores and pay-equity runs are **Confidential** and HR-only by default; market benchmarks are company data licensed from the partner and are not shown outside the comp review and HR analytics.

## 5. Rules (YX-PERF)

| ID | Rule |
|---|---|
| YX-PERF-01 | Goal progress is calculated from its key results, or from its children's weighted progress. It is never typed when key results exist. A goal's parent may be owned by anyone (fixes U70, U71). |
| YX-PERF-02 | Scores include only completed sections. Missing inputs show "pending" and never count as 0. A section without goals is excluded, with a warning (fixes U69, PF-D3). |
| YX-PERF-03 | The manager rating is a separate stage from peer feedback. Peer input is advisory and never averaged into the manager rating unless the template says so (fixes U72). |
| YX-PERF-04 | Only nominated and approved reviewers can give 360° feedback on a review. Quick feedback outside a review goes to any colleague, but follows the visibility rule (fixes PF-D1). |
| YX-PERF-05 | Anonymity per Q4. Anonymous feedback is shown only when at least 3 responses exist for that relationship group. Otherwise it is merged into "others" or held back. |
| YX-PERF-06 | Each stage has an owner and a deadline, with reminders and escalation via P03. The employee always sees the current stage and the next step (fixes U73). |
| YX-PERF-07 | The final score maps to a **band label** (e.g. "Exceeds expectations"). Bands and scale come from the cycle (Q3). |
| YX-PERF-08 | Any calibration change records the before value, after value, reason and who made it. The employee sees only the released final rating. |
| YX-PERF-09 | Ratings are released to employees only at the cycle's release step. A released review can only be reopened by HR with a reason, and this is audited. |
| YX-PERF-10 | Comp proposals come from the matrix (Q6). Changes outside the matrix range need a justification and an extra approval. Approved proposals create dated compensation or promotion changes (P06) and letters (P05). |
| YX-PERF-11 | A PIP needs HR approval to start, has fixed check-ins and ends with a recorded outcome. "Not met" can start an M01 exit case, but never automatically. |
| YX-PERF-12 | Cycle funnel counts are clickable and lead to the list of names (fixes U74). |
| YX-PERF-13 | When a manager leaves or changes mid-cycle, in-flight artefacts transfer on the effective date and each transfer is logged: a **pending manager-review stage** → new manager (the old manager may be added as a named reviewer for input if still employed); **360° nominations awaiting approval** → new manager; **calibration sessions** the old manager facilitated → HR reassigns; **comp proposals** they authored → new manager or HR; **PIP** ownership and check-ins → new manager, HR notified; **1-on-1 threads**: shared notes and open action items move, private notes stay with their author; goals whose parent is the old manager's personal goal → re-parent prompt to the new manager. The new manager gets cycle-scoped read-back of the new reports' current cycle (P02 exception). |
| YX-PERF-14 | **IDP (B16).** An employee has at most one active IDP per period; the employee drafts it, the manager approves it (P03). A **course** item creates an M07 enrolment request that follows M07 approval and budget rules (YX-LRN-07); `learning.enrolment.completed` marks the item done and YX-LRN-03 updates the competency. A **competency** item is done when the competency rating reaches the target level (review or skills test evidence). A **mentor** item is active only after the mentor accepts; the mentor sees only the items they are named on, never ratings. IDP check-ins reuse 1-on-1s. On a manager change the IDP follows YX-PERF-13. |
| YX-PERF-15 | **Career paths (B16).** Paths, steps and required competency levels are company data (D17; starter template labelled as such). An employee's gap for a next role = required level − current rated level per competency; missing ratings show "not assessed", never 0 (as YX-PERF-02). Gaps can be added to the IDP in one click. A path never promotes anyone: promotions still come only from comp review / P06 changes (YX-PERF-10). |
| YX-PERF-16 | **Talent pools and succession (B16).** Pool membership comes from the 9-box / calibration outcome or an HR nomination, always with a reason and audited. Membership is **Confidential**, HR and leadership only; it is shown to the employee only if the company turns on "tell pool members" (D17, off in the starter template). HR can propose a pool member as a successor on an M01 critical position (M01 Q8); readiness is kept in one place (M01 `succession_candidates`) and shown here read-only. A successor's IDP is linked from the succession view. |
| YX-PERF-17 | **Attrition-risk signal (B16; P10).** Opt-in per company. Scored **in-region by YukthiX** (no external LLM for the score) from permitted inputs only: tenure, time since last promotion / increment, compa-ratio, rating trend, manager changes, internal-mobility applications, engagement survey aggregates (M09, respecting its anonymity). **Never used as inputs:** Special data (health, disability, POSH, disciplinary, biometrics), protected attributes (gender, age, religion, caste, marital status, maternity / paternity leave) or individual survey answers. Output is a band with top factors, shown **to HR only**; every view is audited. It is **advisory and never auto-actions**: no workflow, notification to the manager, rating, pay or exit step is triggered by it (YX-AI-01); HR may log a retention action manually. An optional plain-language explanation by an LLM follows P10 tiers (masked, metered in AI credits, YX-AI-02/03). The model is bias-tested before release (P10 governance). |
| YX-PERF-18 | **Pay equity (C3).** Inside a comp review (and in HR analytics), HR and finance approvers see pay gaps by gender, grade, role and location: mean and median, **raw** and **adjusted** (same grade and role), both **before and after** the current proposals. Results are **Confidential**; groups below the P09 threshold show "suppressed" (YX-MET-04), including in exports. Employees whose pay sits below their grade-and-role peer median by more than a company-set threshold (starter template 10 %) are **flagged as advisory** for the reviewer; nothing is adjusted automatically. Managers proposing inside their own comp review see only the "after proposals" gap for their team, subject to suppression. |
| YX-PERF-19 | **Market benchmarks (C3; D18).** The **partner benchmarking feed is a paid add-on** (third-party data, D18 (3)); a company may instead upload its own survey data at no charge. HR maps designation / grade / location to the source's job codes. The comp review sheet shows the market P25–P75 range and the **market ratio** (pay ÷ P50) beside the compa-ratio; the company chooses whether the comp matrix uses internal grade ranges or market position (D17). YukthiX sends **no employee-level data** to the benchmark partner; only the job-code query goes out. Each figure shows its source and effective date; stale data (older than a company-set age) is marked. |
| YX-PERF-20 | **Skills library and mapped views (T2).** Competencies, T01 question tags and M10 scorecard skills each reference a `company_skills` row through `skill_mappings`; a skill in use can't be deleted, only retired or merged, and every view follows. AI skill suggestions (P10 AI credits and data tiers, YX-AI-02) stay **pending** until the employee or their manager confirms; a rejected suggestion isn't re-offered from the same evidence. Only confirmed skills feed career-path gaps, IDPs, talent pools, M07 recommendations and staffing search, and each skill shows its source (self, manager, test, course, project, AI-confirmed). |
| YX-PERF-21 | **Cycle eligibility and proration (J11).** When a cycle starts, each employee gets a `review_eligibility` record from the company rules (starter template, D17: joined after the 3-month cut-off → excluded or probation review instead; mid-cycle joiner → goals for months served; leaver → closed without a rating unless the company opts in; transfer → both managers' inputs weighted by months; maternity or long leave of 3+ months → **protected**: no rating lowered for the leave period, not counted in forced distribution). Increments are prorated by eligible months ÷ cycle months unless the rule says full; leave protected by law (e.g. maternity) is **counted as served**, never prorated down. Every override needs a reason and is audited. |
| YX-PERF-22 | **Own pay band and pay-gap hooks (T4).** With the setting on, an employee sees their own grade's min / mid / max from P01 `grade_pay_ranges` for their entity and currency on the effective date, and their position (below / within / above, quartile), never anyone else's pay; a grade without a range shows "no range set". The YX-PERF-18 engine exposes gender pay-gap figures as P09 metrics for the legal pay-gap reports (EU Directive, US state formats) and the right-to-information answer (average pay by gender for the same grade / work), with P09 suppression. |

## 6. Flows
1. **Goal setting:** company objectives → team → individual (cascade and align) → manager approves the goals → check-ins through the period.
2. **Review cycle** (stages per Q2):
   1. Launch: population and template.
   2. Self review.
   3. 360° nominations and feedback.
   4. Manager review.
   5. Reviewer (skip-level).
   6. Calibration.
   7. Release and acknowledgement.
   8. Comp review.
3. **Continuous:** quick feedback from mobile at any time (fixes U75), and 1-on-1s with a shared agenda.
4. **PIP:** manager proposes → HR approves → plan with goals and support → weekly or bi-weekly check-ins → outcome.
5. **Probation:** M01 triggers a probation review using a probation template here.
6. **Manager change (YX-PERF-13):** M01 manager change or exit → artefacts transferred per rule → new manager and HR see a hand-over list (what moved, what needs a decision) → new manager gets cycle-scoped read-back.
7. **Career & IDP (B16):** employee explores career paths and records an aspiration → sees the competency gap for the next role → drafts an IDP (goals, competencies, M07 courses, mentor, actions) → manager approves → course items become M07 enrolment requests; mentor accepts → check-ins in 1-on-1s → items close from evidence (YX-PERF-14/15).
8. **Talent review (B16):** after calibration / 9-box, HR adds people to talent pools with a reason → proposes pool members as successors on M01 critical positions → successors' IDPs are tracked from the succession view (YX-PERF-16).
9. **Attrition-risk review (B16):** monthly in-region scoring (opt-in) → HR sees the risk list with factors → HR decides whether to act (conversation, IDP, comp review input) and logs it manually; nothing is automatic (YX-PERF-17).
10. **Comp review with equity and market data (C3):** open the comp sheet → market range and ratio per row (YX-PERF-19) → proposals entered → pay-equity panel shows gaps before and after proposals with suppression and advisory flags (YX-PERF-18) → approvals as today (YX-PERF-10).

**Events emitted:** `perf.review.released`, `perf.comp.approved`, `perf.pip.started` / `.closed`, `perf.skill_gap.found` (→ M07 training needs), `perf.idp.approved` (→ M07 enrolment requests for course items), `perf.talent_pool.changed` (→ M01 succession view).

**Events consumed (B16):** `learning.enrolment.completed` (IDP course item done), `learning.certification.expired` (IDP competency evidence re-checked).

## 7. UI
- **My goals:** tree / alignment view with a progress ring per key result.
- **Review workspace:** stage stepper, section cards, a peer-feedback panel (labelled "advisory"), and the band shown with the score.
- **Cycle dashboard:** clickable funnel.
- **Calibration board:** grid of manager ratings, a distribution chart against the guide, drag to change with a reason; 9-box view (wave 6).
- **Comp review sheet:** a spreadsheet-like table of employee, rating, current pay, compa-ratio, suggested range, proposal and budget used.
- **1-on-1:** agenda, shared notes, my private notes, and action items linked to goals.
- **Hand-over list:** after a manager change, the transferred artefacts and those awaiting a decision (YX-PERF-13).
- **My career (B16):** path map from the current designation, the gap per next role, aspiration, and the IDP with item progress, mentor and check-ins.
- **Talent pools (HR, B16):** pool lists, add-with-reason, and a "propose as successor" action into the M01 succession view.
- **Attrition-risk list (HR only, B16):** band, top factors, last viewed, and a manual "action taken" log; labelled "advisory — no automatic action".
- **Comp review sheet additions (C3):** market P25–P75 bar and market ratio per row; a **pay-equity panel** (gap by gender / grade / role / location, raw and adjusted, before / after proposals, "suppressed" where the group is small, advisory flags).
- **Mobile:** goal check-in, quick feedback, review acknowledgement, and IDP check-ins.
- Performance and lifecycle navigation are separate: promotion letters are issued in lifecycle, which fixes U76.

## 8. Migration & rollout
- Import current goals and the last rating per employee (used as history and for comp review).
- Ship templates: annual review, half-yearly, probation, OKR quarterly.
- Wave 5 delivers goals, check-ins, cycles, 360°, basic calibration, PIP, comp review and competencies.
- Wave 6 adds the 9-box and optional enforced distribution (Q5). Basic (guided) calibration was deliberately moved from wave 6 to wave 5 by Q5; only these two remain in wave 6.
- **Gap-register extension (26 Sep 2026), all in launch scope; waves are build order:** wave 5 — career paths, IDPs and mentors (B16), pay-equity panel in the comp review (C3); wave 6 — talent pools with the succession link (with the 9-box), attrition-risk signal (B16), market benchmark feed and survey upload (C3). All included in the per-user price (D18) except the partner benchmark data (add-on) and optional LLM explanations (AI credits).
- Ship a labelled starter template of career paths (individual contributor and manager tracks) mapped to the shipped competency library.

## 9. Acceptance tests (samples)
- Mid-cycle, an employee with only a self review shows "Manager review pending", not 0.4/5 (U69).
- Arjun's key result "close 3 accounts" aligns under Priya's team revenue objective (U70).
- An unrelated employee can't submit 360° feedback on Meera's review (PF-D1).
- A probation review overlapping the annual cycle is allowed (PF-D4).
- An invalid final-score formula is rejected when the template is saved; existing reviews are unaffected (PF-D7).
- Calibrating 4 → 3 needs a reason; the employee sees only the released 3 (YX-PERF-08).
- A band "Exceeds" with a compa-ratio of 0.85 suggests an increment of 10–14 %; proposing 20 % asks for a justification and an extra approval (YX-PERF-10).
- Ravi's manager leaves while his manager review is pending: the stage moves to his new manager, who can read Ravi's current-cycle self review and 360° feedback; the old manager's private 1-on-1 notes are not visible to the new manager (YX-PERF-13).
- Kavya's approved IDP has the course "Stakeholder management"; the M07 enrolment request is created on approval, and when she completes the course the IDP item turns "done" and her competency rises to the course's level (YX-PERF-14).
- Kavya's mentor sees only the mentor item and its check-ins, not her review rating (YX-PERF-14).
- A manager opening Arun's profile sees no attrition-risk band; HR sees "High — 26 months since last increment, compa-ratio 0.82", and no workflow or notification is created (YX-PERF-17).
- The comp review shows the adjusted gender pay gap for grade G5 before (8 %) and after proposals (4 %); a location with 3 women shows "suppressed" in the panel and in the export (YX-PERF-18).
- With no benchmark add-on, a company uploads its own survey file and the comp sheet shows market range and ratio with the upload's date; no employee data is sent out (YX-PERF-19).
- T2: AI suggests *SQL* from an employee's test result; it stays pending until her manager confirms, then shows in her skill profile, the competency view and an M10 scorecard for the same skill (YX-PERF-20).
- J11: in an Apr–Mar cycle with a 3-month cut-off, a February joiner is excluded, a July joiner's increment is prorated 9/12, and an employee on 6 months' maternity leave keeps a protected rating and an unprorated increment (YX-PERF-21).
- T4: a G5 employee sees ₹12–18 L with "within, 2nd quartile"; she can't see any colleague's pay, and an employee whose grade has no range sees "no range set" (YX-PERF-22).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | OKRs, KRAs/KPIs, or both? | **Both, chosen per cycle / department:** OKRs (objective + key results, cascade) and KPIs/KRAs with targets; a template can mix them with weights. |
| Q2 | Review stages and sign-off | **Configurable per cycle, default:** self → 360° (optional) → manager → reviewer (skip-level, optional) → calibration (optional) → HR release → employee acknowledgement (can add a comment, cannot change the rating). |
| Q3 | Rating scale | **Configurable per cycle:** default **1–5 with labels** (Needs improvement … Outstanding) and half-point option; alternatives 1–3 / 1–4 / custom labels; bands for final score. |
| Q4 | 360° reviewers and anonymity | **Employee nominates, manager approves** (min / max count per cycle); **anonymity per cycle:** peers and reports anonymous by default (min 3 responses rule), manager feedback named. |
| Q5 | Calibration at launch | **Wave 5:** calibration sessions with distribution view and **guidance only (no forced bell curve)**, changes with reasons; **wave 6:** 9-box (performance × potential) and optional enforced distribution per company. |
| Q6 | Link ratings to increments / bonus / promotion | **Yes, via a comp review:** a matrix (rating band × compa-ratio) suggests % ranges; budget tracking per department; managers propose, HR / finance approve; approved items become dated changes + letters. Bonus pool split by rating as an option. |
| Q7 | PIP | **Manager-initiated, HR-approved**; 30 / 60 / 90 days; goals, support and scheduled check-ins; outcome **met / extended / not met**; not met → HR decides next step (may open exit case); employee acknowledges the plan. |
| Q8 | Competency framework at launch | **Yes:** shipped library (core, functional, leadership) + custom; levels mapped to designations; rated in reviews; gaps feed training needs (M07); optional **skills test via the assessment engine** (§1.1). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Both OKRs and KPIs/KRAs**, chosen per cycle / department; templates can mix them with weights; OKRs cascade and align across owners (person / team / company). | 25 Sep 2026 |
| Q2 | **Configurable stages per cycle; default:** self → 360° (optional) → manager → skip-level reviewer (optional) → calibration (optional) → HR release → employee acknowledgement (comment allowed, rating unchanged; disagreement flag routes to HR). | 25 Sep 2026 |
| Q3 | **Rating scale per cycle; default 1–5 with labels** (Needs improvement / Partly meets / Meets / Exceeds / Outstanding), optional half-points; alternatives 1–3, 1–4, custom labels; final score always shown with its band; scale is frozen once the cycle launches. | 25 Sep 2026 |
| Q4 | **Employee nominates, manager approves** (min / max per cycle; manager / HR may add reviewers); **anonymity per cycle**, default peers + direct reports anonymous with the ≥ 3-response rule (YX-PERF-05), manager feedback named; identities of anonymous reviewers are not visible to HR in the UI (stored for abuse investigation only, access audited). | 25 Sep 2026 |
| Q5 | **Wave 5:** calibration sessions (group, facilitator) with distribution vs a **guide only** (no forced curve), rating changes with reasons (YX-PERF-08). **Wave 6:** 9-box (performance × potential rating added to review) and optional **enforced distribution** per company. | 25 Sep 2026 |
| Q6 | **Yes, via comp review cycles:** matrix rating band × compa-ratio → suggested % range (pay ranges per grade added to the P01 grade master as dated data; without ranges the matrix uses rating only); department budget tracking; managers propose, HR / finance approve (P03); out-of-range needs justification + extra approval; approved → dated compensation / promotion (P06) + letters (P05); optional bonus-pool split by rating. Managers see team pay only inside the comp review they own (P02 Q3 exception, scoped and audited). | 25 Sep 2026 |
| Q7 | **PIP: manager proposes, HR approves**; 30 / 60 / 90 days; goals, support offered, scheduled check-ins (P04 reminders); employee acknowledges the plan (can comment); outcome met / extended / not met; not met → HR decides next step (may open an M01 exit case, never automatic); PIP letters from P05; PIP visible only to employee, manager chain and HR. | 25 Sep 2026 |
| Q8 | **Competency framework at launch:** shipped library (core / functional / leadership) + custom competencies; proficiency levels mapped to designations; rated in review templates; gaps emit `perf.skill_gap.found` → M07 training needs; optional **skills test through the assessment engine** (§1.1) with result stored as evidence on the competency rating. | 25 Sep 2026 |
| D7 | **Consistency fix — manager leaves or changes mid-cycle:** owner transfer per in-flight artefact (manager-review stage, 360° nomination approvals, calibration facilitation, comp proposals, PIP, 1-on-1 threads, goal parents) with a logged hand-over (YX-PERF-13); private 1-on-1 notes stay with their author; new manager gets cycle-scoped read-back of new reports' current cycle (P02 exception). 1-on-1 record made explicit (agenda, shared / private notes, action items linked to goals). | 26 Sep 2026 |
| F-follow-ups (consistency fix) | **Comp budget per department.** `comp_review_cycles` holds department budgets (budget amount per department / cost centre, currency, used, remaining), needed by the APX-C metric `comp.increment_budget_vs_plan` ("increment budget vs plan") and RPT-PERF-05. | 26 Sep 2026 |
| B16 | Gap-register extension (user decision 26 Sep 2026): **career paths, IDPs, talent pools, attrition risk.** Company-defined career paths with required competency levels and a labelled starter template (D17), gap view per next role (YX-PERF-15); IDP per employee per period with goals, competencies to build, M07 courses (enrolment requests), mentor (accepts; sees only their items) and check-ins via 1-on-1s, manager-approved (YX-PERF-14); Confidential talent pools from 9-box / calibration or nomination, successors proposed into M01 critical positions with readiness kept in M01 (YX-PERF-16); opt-in **attrition-risk signal** scored in-region from permitted inputs only (no Special data, no protected attributes), **HR only, advisory, never auto-actions**, views audited, optional LLM explanation under P10 tiers / AI credits (YX-PERF-17). Waves 5 (paths, IDP) and 6 (pools, risk); included in the price (D18). | 26 Sep 2026 |
| C3 | Gap-register extension (user decision 26 Sep 2026): **pay equity and compensation benchmarking.** Pay-equity panel in the comp review and HR analytics: gap by gender / grade / role / location, mean and median, raw and adjusted, before and after proposals; Confidential; P09 small-group suppression incl. exports; advisory below-peer flags at a company threshold (starter 10 %); never auto-adjusts (YX-PERF-18). **Market benchmark feed from a partner = paid add-on** (D18 third-party data), or free upload of the company's own survey; job-code mapping; market P25–P75 and market ratio in the comp sheet; company chooses internal-range or market axis for the matrix (D17); no employee-level data sent to the partner (YX-PERF-19). Waves 5 (pay equity) and 6 (benchmarks). | 26 Sep 2026 |
| T2 | **Validation pass 3 Should (T2), founder decision 28 Sep 2026:** **one skills library per company, owned by M06** (starter taxonomy + custom; `company_skills`, `skill_mappings`, `person_skills`); **competencies, T01 question tags and M10 scorecard skills are mapped views**; AI suggests skills from CVs, tests, projects and courses and the **employee or manager confirms**; only confirmed skills feed paths, IDPs, pools and recommendations (YX-PERF-20). Amends T01 Q2. EU AI Act row in P10 §A4. Wave 5 (library); proctoring mapping in Proctoring phase 2. | 28 Sep 2026 |
| J11 | **Validation pass 3 Should (J11), founder decision 28 Sep 2026:** **appraisal cycle eligibility**: joining cut-off, mid-cycle joiners, leavers, entity / manager transfers, maternity and long leave protected (no adverse treatment), increment proration by eligible months with legally protected leave counted as served; overrides audited (YX-PERF-21). Wave 5. | 28 Sep 2026 |
| T4 | **Validation pass 3 Should (T4), founder decision 28 Sep 2026:** **employee-visible pay band for own grade** (ranges from P01 `grade_pay_ranges`, position only, never peers' pay; starter template ON, forced on where the law requires) and **pay-gap report hooks** from YX-PERF-18 for legal pay-gap reports and the right-to-information answer (YX-PERF-22). Wave 5 (bands); legal reports before the first EU / US customer. | 28 Sep 2026 |
