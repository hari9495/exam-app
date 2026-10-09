# 07 · Performance — Functional Reference

**Source studied:** Frappe HR, `develop` branch, folder `hrms-develop/hrms` (appraisal cycle, appraisal template, KRA, goal, appraisal, performance feedback, appraisal overview report)
**Maps to YukthiX:** §1.3.8 Performance Management (goals & OKRs, review cycles & appraisals, continuous feedback)
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance.
**Data dictionary:** every object and field → [07-performance.data-dictionary.md](07-performance.data-dictionary.md)

---

## 0. How it works — the big picture

```
 KRA (key result area, e.g. "Revenue")      Feedback Criteria (e.g. "Teamwork")
            └────────────┬──────────────────────────┘
                         ▼
 Appraisal Template = KRAs with weights (Σ 100 %) + rating criteria with weights (Σ 100 %)
                         │   (default template per Designation)
                         ▼
 Appraisal Cycle (period, company, filters, KRA method, final-score formula)
        │ "get employees" → appraisees (+ template)   "create appraisals" → one Appraisal each
        ▼
 Appraisal (per employee per cycle)
   ├─ Goal score   ← KRAs: automated from Goal progress, or manual 1–5 rating per goal
   ├─ Self score   ← employee rates self on criteria
   ├─ Feedback     ← average of submitted Performance Feedback from reviewers
   └─ Final score  ← average of the three, or a custom formula
 Goals (tree: parent → child goals, per employee, per KRA, per cycle; progress %)
```

All scores are on a **0–5 scale**.

---

## 1. Masters

| Master | Data | Rules |
|---|---|---|
| **KRA** | Title, description | — |
| **Feedback criteria** | Criteria name | — |
| **Appraisal Template** | Title, description; KRAs with weightage %; rating criteria with weightage % | **PF-TPL-01:** KRA weights must total 100; criteria weights must total 100 (if the tables have rows). |
| **Designation → template** | Each designation can carry a default appraisal template | Used to pre-fill appraisees. |

---

## 2. Appraisal Cycle

**Data.** Cycle name, company, start & end date, description; filters (branch, department, designation); **KRA evaluation method** (automated from goal progress — default / manual rating); **status** (Not Started / In Progress / Completed); calculate final score by formula (off) + formula; appraisees table (employee, name, branch, department, designation, template).

| ID | Rule |
|---|---|
| PF-CYC-01 | End date after start date. |
| PF-CYC-02 | The KRA evaluation method **can't be changed** once any appraisal exists for the cycle. |
| PF-CYC-03 | **Get employees:** active employees of the company matching the filters; each gets their designation's default template (warning if some are missing). |
| PF-CYC-04 | **Create appraisals:** requires appraisees and a template for every one; one appraisal per appraisee (duplicates silently skipped); > 30 run in background. Manual method → appraisals set to rate goals manually. |
| PF-CYC-05 | **Complete cycle:** blocked while any appraisal is still draft; then status Completed. |
| PF-CYC-06 | **Completed cycle locks everything:** no appraisal, goal or feedback can be created or changed against it (set back to In Progress to allow). |
| PF-CYC-07 | Cycle dashboard: appraisees, self-appraisals pending (self score 0), employees without goals, employees without feedback. |

**Source:** `hr/doctype/appraisal_cycle/`, `appraisee/`

---

## 3. Goals

**Data.** Goal name, employee, company, start & end date, **progress %**, status (Pending / In Progress / Completed / Archived / Closed), description, KRA, appraisal cycle, parent goal, is-group (has sub-goals), user.

| ID | Rule |
|---|---|
| PF-GOL-01 | Employee active; cycle (if any) not completed; start ≤ end. |
| PF-GOL-02 | Progress ≤ 100. |
| PF-GOL-03 | Status from progress (unless Archived / Closed): 0 → Pending, 100 → Completed, otherwise In Progress. Marking Completed sets progress to 100. |
| PF-GOL-04 | A child goal must have the **same employee, KRA and cycle** as its parent. Changing a parent's KRA changes all its children. |
| PF-GOL-05 | **Parent progress = average of its non-archived children's progress** (recalculated on every change). |
| PF-GOL-06 | Any goal change re-computes the goal score of that employee's appraisal in the cycle. |
| PF-GOL-07 | Goal tree view per employee / cycle / date range, showing "x of y completed" for group goals; quick progress update and bulk status change. |

> **Example.** Group goal "Grow revenue" with sub-goals Q1 target 100 %, Q2 target 60 %, new accounts 20 % → parent progress **60 %**.

**Source:** `hr/doctype/goal/`

---

## 4. Appraisal

**Data.** Employee, company, department, designation, cycle (+ its dates), template; **KRA table** (KRA, weightage, goal completion %, weighted goal score) *or* **goals table** (goal/KRA, weightage, 1–5 score, score earned) when rating manually; **self-ratings** (criteria, weightage, rating); reflections, remarks; scores: goal score %, total goal score, self score, average feedback score, **final score**.
**Status.** Draft → Submitted → Cancelled.

| ID | Rule |
|---|---|
| PF-APR-01 | Employee active; cycle not completed. |
| PF-APR-02 | One non-cancelled appraisal per employee per cycle **or** overlapping period. |
| PF-APR-03 | KRA weights and self-rating weights must each total 100. |
| PF-APR-04 | Template (from the cycle's appraisee row) fills KRAs (or goals, if manual) and self-rating criteria. |

**Score calculations (all 0–5)**

*Goal score — automated.* For each KRA: goal completion = average progress of the employee's **top-level**, non-archived goals under that KRA in the cycle; weighted = completion × weight / 100. Goal score % = Σ weighted; **total goal score = goal score % ÷ 20**.
> Revenue 60 % weight, completion 80 % → 48; Quality 40 %, completion 50 % → 20. Goal score % = 68 → **3.4 / 5**.

*Goal score — manual.* Each goal rated 0–5 (can't exceed 5); earned = score × weight / 100; total = Σ earned.
> Goal A 60 % rated 4 → 2.4; Goal B 40 % rated 3 → 1.2 → **3.6 / 5**.

*Self score.* Σ (rating out of 5 × weight / 100).
> Teamwork 50 % rated 4 → 2.0; Communication 50 % rated 3 → 1.5 → **3.5**.

*Average feedback score.* Average of the total scores of all **submitted** Performance Feedback for this appraisal.
> Reviewer A 4.0, reviewer B 3.0 → **3.5**.

*Final score.* Default = (goal + self + feedback) ÷ 3. Or a **custom formula** (cycle setting) using goal score, average feedback score, self-appraisal score plus any cycle, employee or appraisal field.
> Default: (3.4 + 3.5 + 3.5) ÷ 3 = **3.47**. Formula "goal × 0.6 + feedback × 0.3 + self × 0.1" → 2.04 + 1.05 + 0.35 = **3.44**.

**Source:** `hr/doctype/appraisal/`, `appraisal_kra/`, `appraisal_goal/`, `mixins/appraisal.py`

---

## 5. Employee Performance Feedback (continuous / 360°)

**Data.** Employee (for), reviewer (employee), reviewer name / designation, appraisal, cycle, department, designation, company, added on, feedback text (required), ratings per criteria (rating, weightage), total score, user.
**Status.** Draft → Submitted → Cancelled.

| ID | Rule |
|---|---|
| PF-FB-01 | Cycle not completed. Employee and reviewer both active. |
| PF-FB-02 | **Reviewer can't be the employee** (use self-appraisal instead). |
| PF-FB-03 | The appraisal must belong to that employee. |
| PF-FB-04 | Criteria weights total 100; criteria pre-filled from the appraisal's template. |
| PF-FB-05 | Total score = Σ (rating out of 5 × weight / 100). |
| PF-FB-06 | Submit / cancel recalculates the appraisal's average feedback score and final score. |
| PF-FB-07 | Feedback can also be added directly from the appraisal screen (reviewer = current user's employee; submitted immediately). |
| PF-FB-08 | Feedback history view: all submitted feedback with reviewer, date, score, and a 1–5 star distribution. |

**Source:** `hr/doctype/employee_performance_feedback/`, `employee_feedback_rating/`

---

## 6. Reports, mobile, permissions

**Appraisal Overview report:** per employee: designation, cycle, appraisal, feedback count, average feedback score, goal score, self score, final score, department.

| Object | Employee | HR User | HR Manager | System Manager |
|---|---|---|---|---|
| Appraisal Cycle | read | create/edit | full | full |
| Appraisal Template | read | create/edit | full | — |
| Appraisal | create, edit (own via user permission) | full | create, edit, submit (**no cancel**) | full |
| Goal | create, edit, delete | full | full | full |
| Performance Feedback | create, edit, **submit, cancel** | **read only** | create, submit, cancel | full |
| KRA | — | **none** | full | full |

---

## 7. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| PF-D1 | **Any employee can give feedback on any colleague** (no check that the reviewer is the manager, a peer or nominated) — only "not yourself". | As Employee, create feedback for an unrelated employee's appraisal. |
| PF-D2 | HR User can only **read** performance feedback and has **no** access to KRAs; HR Manager can't cancel an appraisal. | Log in as HR User / HR Manager. |
| PF-D3 | Automated goal score averages only **top-level** goals per KRA (sub-goals count only through their parent's progress), and a KRA with no goals silently scores 0 — pulling the total down with no warning. | Appraisal with one KRA that has no goals. |
| PF-D4 | Duplicate check blocks a second appraisal in any **overlapping** period — even in another cycle (e.g. probation review overlapping the annual cycle). | Two cycles with overlapping dates. |
| PF-D5 | No workflow stages (goal-setting → self → manager → calibration → release); submit is a single step; no manager rating separate from feedback. | — |
| PF-D6 | No normalisation / bell-curve / calibration; no link from final score to increments, bonus or promotion. | — |
| PF-D7 | Custom final-score formula runs with employee fields in scope — a typo breaks every appraisal save in the cycle. | Enter an invalid formula. |

---

## 8. Gap analysis vs YukthiX spec §1.3.8

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Goals with cascading (tree), progress, KRA alignment | ✅ | ✅ "goals and OKRs" | Add **OKR** style (objective + measurable key results with target/actual), company → team → individual cascade. |
| Review cycles & appraisals | ✅ | ✅ | |
| Stage workflow (goal setting, self, manager, reviewer, calibration, sign-off) with deadlines | ❌ | ✅ | Must build (via §2.1.4). |
| Manager rating distinct from peer feedback | ❌ | ✅ | |
| 360° feedback with nominated reviewers, anonymity | ⚠️ open to anyone, not anonymous | ✅ "continuous feedback" | Nominations + anonymity options. |
| Calibration / normalisation / 9-box | ❌ | ❌ | 💡 Differentiator. |
| Link to increments, bonus, promotion (compensation review) | ❌ | ❌ | Tie final rating to salary revision (module 03) and promotion (module 05). |
| Probation reviews | ❌ | ⚠️ (§1.3.1 probation) | Reuse appraisal engine for probation. |
| 1-on-1s, check-ins, recognition | ❌ | ✅ §1.3.16 recognition | Add check-ins. |
| Competency framework / skills assessment | ⚠️ skills on designation / employee | ❌ | Link to skill map. |
| Performance improvement plan (PIP) | ❌ | ❌ | Add. |
| Analytics | ⚠️ one report | ✅ §1.4 | Distribution, completion rates, manager comparison. |

---

## 9. YukthiX design questions (for the later design phase)

1. OKRs, KRAs/KPIs, or both?
2. Which review stages and who signs off?
3. Rating scale: 1–5 stars, custom labels, or configurable?
4. 360° feedback: nominated reviewers? anonymous?
5. Calibration / bell curve at launch?
6. Should final ratings drive increment and bonus recommendations?

---

## 10. Source pointers (for verification only)

| Area | Path in `hrms-develop/hrms` |
|---|---|
| Cycle | `hr/doctype/appraisal_cycle/`, `appraisee/` |
| Template, KRA, criteria | `hr/doctype/appraisal_template*/`, `kra/`, `employee_feedback_criteria/` |
| Appraisal & scoring | `hr/doctype/appraisal/`, `appraisal_kra/`, `appraisal_goal/`, `mixins/appraisal.py` |
| Goals | `hr/doctype/goal/` |
| Feedback | `hr/doctype/employee_performance_feedback/`, `employee_feedback_rating/` |
| Report | `hr/report/appraisal_overview/` |
