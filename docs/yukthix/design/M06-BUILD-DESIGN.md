# M06 · Performance · Build design

> **Status:** ✅ Decided, 12 Oct 2026: the founder accepted D1–D14 with the recommended defaults (§23). Batch PM1 is being built on `feat/yukthix-performance-1`. The module decisions (Q1–Q8, D7, B16, C3, T2, J11, T4) were taken on 25–28 Sep 2026 in [M06](M06-performance.md); this doc turns the launch part of them into tables, permissions, APIs, jobs, screens, tests and small pull requests.
> **Scope:** goals and OKRs with alignment and check-ins; continuous feedback and 1:1s; review cycles (self, manager, peer / 360°, skip-level) with templates and rating scales as data; calibration with distribution guidance (never forced by default); the outcome to compensation (merit and bonus proposals with budgets, handed to payroll as approved pay changes); PIPs linked to lifecycle exits; privacy and anonymity; reports; India and global points.
> **Order:** eight batches, **PM1 → PM8**. PM1–PM5 run a first review cycle end to end; PM6 adds calibration and reports; PM7 turns ratings into pay; PM8 adds PIPs.
> **Builds on:** P03 approvals, P19 rules, P04 notifications, P05 letters, P06 effective-dated history (employee changes, bulk batches), P02 visibility, P09 small-group suppression, M01 lifecycle (manager changes, probation, exits), M03 payroll (pay ranges, one-time pay, arrears), G1 (translations, country packs).
> **Clean-room:** written in our own words from our own design docs and public law and guidance. No competitor text, screens or field names are copied. Frappe / ERPNext code is not read or copied.

---

## 1. How to read this doc

- **Section 2** lists what is already decided. Nothing there is asked again.
- **Section 4** says where the module lives, what it reuses and the small changes it needs elsewhere.
- **Section 5** is the data model, by batch. Every table follows §5.1.
- **Sections 7–16** describe how each part works.
- **Sections 17–21** are permissions, events, API, screens and security.
- **Section 22** is the build order: PR-sized slices with their tests.
- **Section 23** holds the decisions for the founder, each with a recommended default.

Words used here:
- **Cycle:** one review period (annual, half-yearly, quarterly, project or probation) for a population, with a template, a rating scale and stages.
- **Review:** one employee's record in one cycle.
- **Entry:** one person's input to a review at one stage (self, manager, peer, skip-level).
- **Band:** the label a final score maps to (for example "Exceeds expectations").
- **Released:** the moment a rating becomes visible to the employee. Nothing before it is.
- **In scope:** the people a permission key reaches, through P02 grants (company-wide, legal entity, location, department) or the manager chain.

---

## 2. Decisions this design follows

| Topic | Decision | Source |
|---|---|---|
| Goals | OKRs and KPIs / KRAs, chosen per cycle or department; a template can mix them with weights; goals cascade and align across owners (person, team, company) | M06 Q1 |
| Stages | Configurable per cycle; default self → 360° (optional) → manager → skip-level (optional) → calibration (optional) → HR release → acknowledgement | M06 Q2 |
| Rating scale | Per cycle, default 1–5 with labels, optional half-points; frozen once the cycle launches; final score always shown with its band | M06 Q3 |
| 360° | Employee nominates, manager approves (min / max); peers and reports anonymous by default with at least 3 responses; manager feedback named; reviewer identities not visible to HR in the UI | M06 Q4 |
| Calibration | Sessions with a distribution **guide only** at launch; every change has a reason; 9-box and optional enforced distribution later (wave 6) | M06 Q5 |
| Comp review | Rating band × compa-ratio matrix suggests a % range; department budgets; managers propose, HR / finance approve; out-of-range needs a justification and an extra approval; approved items become dated pay changes and letters; optional bonus pool split by rating | M06 Q6, F-follow-up |
| PIP | Manager proposes, HR approves; 30 / 60 / 90 days; check-ins; employee acknowledges; outcome met / extended / not met; "not met" never starts an exit automatically | M06 Q7 |
| Competencies | Shipped library + custom; levels mapped to designations; rated in reviews; gaps go to learning | M06 Q8 |
| Skills library | One library per company, owned by M06; competencies are a mapped view of it | M06 T2 |
| Manager change | In-flight artefacts move to the new manager on the effective date, each move logged; private 1:1 notes stay with their author | M06 D7, YX-PERF-13 |
| Eligibility | Joining cut-off, mid-cycle joiners, leavers, transfers, protected leave (no adverse treatment), increment proration by eligible months | M06 J11 |
| Own pay band | An employee sees their own grade range and position, never anyone else's pay | M06 T4 |
| Pay equity | Gap panel inside the comp review with small-group suppression; advisory only | M06 C3 |
| Visibility | Ratings are Confidential: the employee (after release), the manager chain and HR in scope | P02 |
| Small groups | Breakdowns below 5 people (tenant 3–10) are suppressed for viewers without individual access | P09 Q2, YX-MET-04 |
| POSH | Case details are never used in performance or other modules | M08 YX-POSH-05 |
| AI | Every AI output is advisory; Special data never goes to an external model | P10, P23 |
| Approvals | Server-side P03 chains, delegation, reminders and escalation; maker ≠ checker | P03 |
| Pay changes | Dated facts through P06 employee changes; back-dated changes become arrears in the next run | P06, M03-BUILD §7.6 |

---

## 3. Scope

### 3.1 In (this design)
- Goals and OKRs: owners, cascade and alignment, key results, weights, approval, check-ins.
- Continuous feedback: give, request, received; 1:1s with shared agenda, shared and private notes, action items.
- Review cycles: templates, sections, questions and rating scales as data; eligibility; self, manager, skip-level and peer / 360° entries; scoring; release; acknowledgement and disagreement; manager change hand-over; probation reviews on the same engine.
- Calibration sessions with a distribution guide and reasoned changes.
- Compensation review: merit matrix, budgets, proposals, bonus split, approvals, hand-off to payroll and letters; own pay band; pay-equity panel.
- PIPs with check-ins, letters and the link to lifecycle exits.
- Competencies (as the first view of the company skills library).
- Privacy, anonymity and POSH-sensitive handling.
- Reports.

### 3.2 Out (a second M06 design, after this one ships)
Each is decided in M06; it is left out here only to keep the first build small.
- Career paths, IDPs and mentors (B16).
- Talent pools, the 9-box and the succession link (B16, Q5 wave 6).
- Enforced distribution (Q5 wave 6).
- Attrition-risk signal (B16).
- Market benchmarks, partner feed and survey upload (C3).
- AI skill suggestions for the skills library (T2), and every other AI feature (§16.4).
- Legal pay-gap report packs (T4 hooks are built; the packs come with the first EU / US customer).

---

## 4. Where it lives and what we reuse

**API:** `apps/api/src/performance/` (NestJS module `PerformanceModule`), one service per area: `setup`, `goals`, `feedback`, `cycles`, `reviews`, `calibration`, `comp`, `pips`, `reports`. Pure rules in `perf-rules.ts` (scoring, anonymity, eligibility, matrix lookup, proration), unit-tested.

**UI:** `packages/yx-ui/src/screens/performance/live/` wires the existing prototypes (`screens/growth/perf-*.tsx`, PRF-01…17). Web pages under `/yx/performance/*`.

**Reused as is:**
- **P03 `ApprovalsEngine`:** goal approval, 360° nomination approval, stage submissions that need a sign-off, calibration sign-off, comp proposals, PIP start. Request types are registered in `onModuleInit` like leave and expenses.
- **P19 conditions** (`parseGroup` / `evaluate`): cycle populations, eligibility rules, template "applies to", matrix rows by grade or entity.
- **Settings registry** (`settingFor`): company and entity options (`perf.*`, §6.1).
- **P06 employee changes and bulk batches** (`employee_changes`, `employee_change_batches`): approved merit and promotion proposals become `salary_revision` / `promotion` changes in one batch per comp cycle and entity.
- **M03 `one_time_pays`** (source `m06` already allowed): approved bonuses.
- **M03 `grade_pay_ranges`:** compa-ratio and own pay band.
- **P05 letters** (`letter.issue`): increment, promotion, appraisal outcome and PIP letters.
- **M01 exits:** a "not met" PIP gives HR a one-click start of a company-initiated exit case.
- **G1 `content_translations`:** rating labels, section titles, competency names (§6.4).
- **P04 notifications** and the jobs pattern (`perf-jobs.ts`, BullMQ like lifecycle).
- **`buildViewer` / `grantPeriods` / `holdersOf`:** P02 scope checks, as in expenses.

### 4.1 Changes needed in other modules (small, listed for their owners)

| # | Module | Change | Needed by |
|---|---|---|---|
| 1 | M01 / P06 | `employee_change_batches.source` gains `comp_review`; the batch keeps `comp_cycle_id` | PM7 |
| 2 | G1 | `content_translations.subject_type` gains `rating_level`, `review_section`, `competency` | PM1 |
| 3 | M03 (payroll builder) | Starter component `perf_bonus` (earning, taxable, outside the statutory bonus and wage bases) for M06 one-time pay | PM7 |
| 4 | M01 | `exit_cases.source_type` / `source_id` (nullable) so an exit opened from a PIP links back to it | PM8 |
| 5 | P05 | Starter templates for `appraisal_outcome`, `increment`, `promotion`, `pip` letters if not yet seeded (APX-F lists them) | PM7, PM8 |
| 6 | P04 | Notification types in §18.2 | each batch |

---

## 5. Data model

### 5.1 Rules for every new table
- `organization_id NOT NULL`, composite foreign keys on `(organization_id, id)`.
- **Forced RLS** with the `tenant_isolation` policy.
- Ratings, comments, calibration, comp and PIP tables also get the **restrictive `support_session_excluded` policy**: YukthiX support never reads them (like expenses and payroll).
- `app_runtime` loses `DELETE` / `TRUNCATE` on every table that holds a decision (reviews, entries, calibration changes, comp proposals, PIPs): records are closed or superseded, never erased (§15.2).
- Writes take `version` for optimistic locking.
- Amounts are `DECIMAL(14,2)` with a `currency CHAR(3)`; percentages are `DECIMAL(6,2)`.

### 5.2 Batch PM1 · Scales, templates, competencies

| Table | Main columns | Notes |
|---|---|---|
| `rating_scales` | `name`, `kind` (`numeric` / `labelled`), `min`, `max`, `step` (1 or 0.5), `status`, `version` | Data, never code |
| `rating_scale_levels` | `scale_id`, `value`, `label`, `description`, `seq` | Labels translatable (G1) |
| `rating_bands` | `scale_id`, `from_score`, `to_score`, `label`, `seq` | Final score → band; ranges must cover the scale without gaps or overlaps (checked on save) |
| `review_templates` | `name`, `kind` (`annual` / `half_yearly` / `quarterly` / `project` / `probation`), `scale_id`, `scoring` (`weighted` / `manager_overall`), `version`, `status` (`draft` / `active` / `retired`), `applies_to` (P19 group) | A new version is made on any change once used; cycles pin a version |
| `review_template_sections` | `template_id`, `seq`, `kind` (`goals` / `competencies` / `values` / `questions` / `overall`), `title`, `weight`, `rated` (bool), `who_answers` (array of `self` / `manager` / `peer` / `skip`) | Weights of rated sections sum to 100 (checked on save, PF-D7) |
| `review_template_questions` | `section_id`, `seq`, `text`, `answer` (`rating` / `text` / `both`), `required`, `max_chars` | |
| `competencies` | `company_skill_id`, `group` (`core` / `functional` / `leadership`), `status`, `starter_key` | A view on the T2 skills library (`company_skills`, built here in its first form) |
| `competency_levels` | `competency_id`, `level`, `label`, `behaviours` | |
| `role_competency_map` | `designation_id`, `competency_id`, `expected_level`, `valid_from` | Dated |
| `company_skills` | `parent_id`, `name`, `kind` (`domain` / `skill` / `sub_skill`), `status` (`active` / `retired` / `merged_into`), `starter_key` | First form of the T2 library; AI suggestions come later (§3.2) |

### 5.3 Batch PM2 · Goals

| Table | Main columns | Notes |
|---|---|---|
| `goal_periods` | `name`, `from_on`, `to_on`, `status` | Shared by goals and cycles |
| `goals` | `period_id`, `owner_type` (`person` / `team` / `company`), `owner_employee_id?`, `owner_department_id?`, `parent_goal_id?`, `kind` (`okr` / `kpi`), `title`, `description`, `weight`, `status` (`draft` / `submitted` / `approved` / `active` / `done` / `dropped`), `progress` (calculated), `wf_request_id`, `version` | Parent may be owned by anyone (YX-PERF-01); a cycle is refused |
| `key_results` | `goal_id`, `title`, `unit`, `direction` (`up` / `down` / `hit`), `start_value`, `target_value`, `current_value`, `weight` | Progress is calculated, never typed |
| `goal_checkins` | `goal_id`, `by_user_id`, `on`, `values` (per KR), `confidence` (`on_track` / `at_risk` / `off_track`), `note` | Append-only |

### 5.4 Batch PM3 · Feedback and 1:1s

| Table | Main columns | Notes |
|---|---|---|
| `feedback_items` | `from_employee_id`, `to_employee_id`, `kind` (`praise` / `suggestion`), `text`, `visibility` (`private` = recipient and their manager / `recipient_only`), `goal_id?`, `request_id?`, `withdrawn_at` | Anytime feedback (YX-PERF-04) |
| `feedback_requests` | `requester_employee_id`, `about_employee_id`, `asked_employee_id`, `question`, `status`, `due_on` | "Ask for feedback" |
| `one_on_ones` | `employee_id`, `manager_employee_id`, `on`, `status` (`planned` / `held` / `cancelled`), `shared_notes`, `series_id?` | |
| `one_on_one_agenda` | `one_on_one_id`, `added_by`, `text`, `done` | Shared |
| `one_on_one_private_notes` | `one_on_one_id`, `author_user_id`, `text` | Readable only by the author; never transferred (D7) |
| `one_on_one_actions` | `one_on_one_id`, `owner_employee_id`, `text`, `due_on`, `goal_id?`, `done_at` | |

### 5.5 Batch PM4 · Cycles and reviews

| Table | Main columns | Notes |
|---|---|---|
| `review_cycles` | `name`, `kind`, `period_from`, `period_to`, `template_id` + `template_version`, `scale_id`, `population` (P19 group), `stages` (`jsonb`: ordered stage keys, owner rule, deadline, optional flag), `eligibility_rules` (`jsonb`, J11), `anonymity` (`jsonb`, §10), `status` (`draft` / `launched` / `calibrating` / `released` / `closed`), `launched_at`, `released_at`, `version` | Scale and template frozen at launch (Q3) |
| `review_eligibility` | `cycle_id`, `employee_id`, `employment_id`, `rule` (`included` / `excluded_cutoff` / `leaver` / `transfer_split` / `protected_leave`), `eligible_months`, `proration`, `override_reason`, `by_user_id` | J11, YX-PERF-21 |
| `reviews` | `cycle_id`, `employee_id`, `employment_id`, `legal_entity_id`, `manager_employee_id` (current owner), `stage`, `status` (`open` / `in_calibration` / `ready` / `released` / `acknowledged` / `closed`), `section_scores` (`jsonb`), `final_score`, `band`, `calibrated_score`, `released_at`, `acknowledged_at`, `disagreement` (bool), `reopened_reason?`, `version` | One per employee per cycle |
| `review_entries` | `review_id`, `stage` (`self` / `manager` / `peer` / `skip` / `other`), `author_user_id`, `relationship` (`self` / `manager` / `peer` / `report` / `skip` / `other`), `answers` (`jsonb`: per question rating and text), `overall_rating?`, `status` (`draft` / `submitted`), `submitted_at`, `anonymous` (bool) | Author kept for abuse review only (§10.3) |
| `review_stage_log` | `review_id`, `stage`, `from_owner`, `to_owner`, `event` (`opened` / `submitted` / `skipped` / `reassigned` / `reopened`), `reason`, `at` | The visible "next step" trail (U73) |
| `perf_owner_transfers` | `employee_id`, `old_manager_employee_id`, `new_manager_employee_id`, `effective_on`, `artefact_type`, `artefact_id`, `decision_needed` (bool), `by_user_id` | D7 hand-over list |
| `review_disagreements` | `review_id`, `text`, `status` (`open` / `answered` / `upheld` / `not_upheld`), `hr_note`, `decided_by` | PRF-15 |

### 5.6 Batch PM5 · Peer and 360°

| Table | Main columns | Notes |
|---|---|---|
| `feedback_nominations` | `review_id`, `reviewer_employee_id`, `relationship` (`peer` / `report` / `other`), `proposed_by` (`employee` / `manager` / `hr`), `status` (`proposed` / `approved` / `declined` / `withdrawn` / `submitted`), `wf_request_id` | Only approved nominees can answer (YX-PERF-04) |
| `reviewer_blocks` | `employee_a`, `employee_b`, `reason_code` (`conflict` / `confidential_matter`), `until_on?`, `set_by` | HR-only. Blocks a pair from reviewing each other; the reason is never shown to either (§15.3) |

### 5.7 Batch PM6 · Calibration

| Table | Main columns | Notes |
|---|---|---|
| `calibration_sessions` | `cycle_id`, `name`, `facilitator_user_id`, `population` (P19 group or explicit list), `guide` (`jsonb`: share per band, tolerance), `status` (`open` / `signed_off`), `signed_off_by`, `signed_off_at` | |
| `calibration_changes` | `session_id`, `review_id`, `from_score`, `to_score`, `from_band`, `to_band`, `reason`, `by_user_id`, `at` | YX-PERF-08; append-only |

### 5.8 Batch PM7 · Compensation review

| Table | Main columns | Notes |
|---|---|---|
| `comp_cycles` | `review_cycle_id?`, `legal_entity_id`, `currency`, `effective_on`, `bonus_period_id?`, `status` (`draft` / `open` / `in_approval` / `approved` / `applied` / `closed`), `matrix_id`, `version` | One per entity and pay currency |
| `comp_budgets` | `comp_cycle_id`, `department_id` or `cost_centre_id`, `kind` (`merit` / `bonus` / `promotion`), `amount`, `used` (calculated), `remaining` (calculated) | F-follow-up |
| `comp_matrices` | `name`, `axis` (`compa_ratio` / `rating_only`), `version`, `status` | Data |
| `comp_matrix_cells` | `matrix_id`, `band`, `compa_from`, `compa_to`, `min_pct`, `target_pct`, `max_pct` | Cells must tile the axis (checked on save) |
| `comp_proposals` | `comp_cycle_id`, `employee_id`, `employment_id`, `review_id?`, `band`, `current_ctc`, `compa_ratio`, `eligible_months`, `proration`, `merit_pct`, `merit_amount`, `promotion_to_grade_id?`, `promotion_to_designation_id?`, `promotion_amount`, `bonus_amount`, `new_ctc`, `out_of_range` (bool), `justification`, `status` (`draft` / `submitted` / `approved` / `rejected` / `applied`), `wf_request_id`, `change_id?`, `one_time_pay_id?`, `letter_id?`, `version` | Snapshot of what the approver saw |
| `pay_equity_runs` | `comp_cycle_id`, `dimensions`, `measure`, `results` (`jsonb`: raw and adjusted, before and after, suppressed cells marked), `run_by`, `run_at` | C3, YX-PERF-18 |

### 5.9 Batch PM8 · PIPs

| Table | Main columns | Notes |
|---|---|---|
| `pips` | `employee_id`, `employment_id`, `manager_employee_id`, `reason`, `expectations`, `support`, `starts_on`, `ends_on`, `checkin_every_days`, `status` (`proposed` / `active` / `paused` / `met` / `extended` / `not_met` / `withdrawn`), `wf_request_id`, `acknowledged_at`, `employee_comment`, `outcome_note`, `letter_id?`, `exit_case_id?`, `version` | Q7 |
| `pip_goals` | `pip_id`, `goal_id?`, `text`, `measure`, `status` | |
| `pip_checkins` | `pip_id`, `due_on`, `held_on`, `manager_note`, `employee_note`, `status` (`due` / `held` / `missed`) | Fixed schedule from the start date |

### 5.10 RLS summary

| Table group | `tenant_isolation` | `support_session_excluded` | DELETE revoked |
|---|---|---|---|
| Scales, templates, competencies, skills, goal periods | ✔ | — | — (status `retired`) |
| Goals, key results, check-ins | ✔ | — | ✔ check-ins |
| Feedback, requests, 1:1s and their parts | ✔ | ✔ | ✔ private notes |
| Cycles, eligibility, reviews, entries, stage log, transfers, disagreements | ✔ | ✔ | ✔ |
| Nominations, reviewer blocks | ✔ | ✔ | ✔ |
| Calibration sessions and changes | ✔ | ✔ | ✔ |
| Comp cycles, budgets, matrices, proposals, pay-equity runs | ✔ | ✔ | ✔ proposals, runs |
| PIPs, PIP goals, PIP check-ins | ✔ | ✔ | ✔ |

Every new table goes into the RLS isolation suite, and the support-excluded ones into its restrictive list.

---

## 6. Company settings and starter data

### 6.1 Settings registry keys (`perf.*`)

| Key | Values (starter in bold) | Scope |
|---|---|---|
| `perf.goal.approval` | **`manager`** / `none` | tenant, entity |
| `perf.goal.checkin_days` | `14` / **`30`** / `90` | tenant |
| `perf.one_on_one.reminder_days` | `off` / `7` / **`14`** / `30` | tenant |
| `perf.feedback.visibility_default` | **`private`** / `recipient_only` | tenant |
| `perf.anonymity.min_responses` | **`3`** / `4` / `5` (never below 3) | tenant |
| `perf.self_review.visible_to_manager` | **`after_manager_draft`** / `immediately` | tenant |
| `perf.release.mode` | **`cycle`** / `per_session` | tenant |
| `perf.disagreement.days` | `7` / **`15`** / `30` | tenant, entity |
| `perf.comp.budget_overrun` | `block` / **`extra_approval`** | tenant, entity |
| `perf.comp.effective_basis` | **`cycle_date`** / `approval_month` | tenant, entity |
| `perf.pay_band.visible` | **`on`** / `off` (forced on where the law requires) | tenant, entity |
| `perf.pip.lengths` | **`30,60,90`** | tenant |

### 6.2 Starter templates (YukthiX starters, copied and never overwritten; D17)
- **Rating scale** 1–5 with our own labels: *Needs improvement*, *Partly meets*, *Meets*, *Exceeds*, *Outstanding*; bands on the final score.
- **Review templates:** annual, half-yearly, probation (used by M01 probation reviews), quarterly OKR check.
- **Competency library:** about 12 core, functional and leadership competencies with four levels each, written by us.
- **Merit matrix:** five bands × three compa-ratio ranges (below 0.9, 0.9–1.1, above 1.1) with example percentages labelled "example, replace with your own".
- **Distribution guide** for calibration (example shares per band, "guide only").

### 6.3 Pre-flight check
A cycle cannot launch until: the template's weights sum to 100, its bands cover the scale, every eligible employee has a manager, and the stages' owners resolve. The check lists each problem with a link to fix it (like the expenses set-up check).

### 6.4 Translations (G1)
Rating level labels, band labels, section titles and competency names are translatable in Settings › Translations. The reader sees their language, else the company's words. Question texts are translated per template version. Free-text answers are never machine-translated.

---

## 7. Goals and OKRs

### 7.1 Owners and alignment
- A goal belongs to a person, a team (department) or the company, for one goal period.
- **Alignment:** a goal may name a parent goal owned by anyone in the company (YX-PERF-01, U70). A cycle in the parent chain is refused. Aligning to a goal does not give the aligner any right to see its owner's other goals.
- **Cascade:** a manager or goal owner can copy a goal down as a draft for named people, who edit and submit it.

### 7.2 Progress (never typed when key results exist)
- A key result's progress is `(current − start) ÷ (target − start)`, capped at 0–100 %. `down` reverses the sign; `hit` is 0 or 100 %.
- A goal's progress is the weighted average of its key results, or of its child goals when it has none. A KPI without key results keeps a typed value with its check-in history.
- Check-ins record new KR values, a confidence and a note. The goal stores the calculated progress; the history is kept.

### 7.3 Approval
With `perf.goal.approval = manager`, a person's goals for a period go to P03 `perf.goal_set` (the manager, no self-approval). Approved goals can still get check-ins; changing a target after approval needs a new submission with a reason.

### 7.4 Weights
A person's goals in one period should add to 100 %. The screen warns until they do; a review's goals section uses the weights as they stand when the review opens.

---

## 8. Continuous feedback and 1:1s

### 8.1 Feedback
- Anyone can give praise or a suggestion to any colleague at any time (YX-PERF-04), from web or mobile (U75).
- **Visibility:** `private` (the recipient and their manager chain) by default; `recipient_only` when the giver chooses it. Never public; recognition walls are M09.
- **Requests:** an employee or manager asks named colleagues for feedback about someone; answers arrive as feedback items linked to the request.
- Feedback can be linked to a goal. It appears in the review workspace as **context**, labelled as such, and is never scored.
- The giver can withdraw an item within 24 hours; after that only HR can hide it, with a reason (audited).

### 8.2 1:1s
- A 1:1 has a shared agenda (both add items), shared notes, private notes per author, and action items that can link to goals (D7).
- A series repeats on a cadence; P04 reminds both people before it. Missed or cancelled meetings are recorded, never deleted.
- **Private notes** are readable only by their author, are never in an export, and never move on a manager change.
- Action items left open move to the next 1:1 of the pair.

### 8.3 POSH-sensitive handling
See §15.3. Every feedback and 1:1 form carries **"Report a concern instead"**, which takes the person to the confidential concern channel, out of performance.

---

## 9. Review cycles

### 9.1 Templates and scales as data
- A template is sections (goals, competencies, values, open questions, overall) with weights, questions and who answers each section. A scale is levels with labels plus bands. Both are rows, edited in Settings › Performance; no formula code.
- **Scoring modes:**
  - `weighted` (default): final score = weighted average of rated sections, from the manager's entry (or the skip-level's, when the stage owns the final rating). A section with no inputs is **excluded and named**, never scored 0 (YX-PERF-02, U69).
  - `manager_overall`: the manager's overall rating is the final score; section ratings are guidance.
- Peer entries are advisory and never averaged into the score unless the template's section explicitly says so (YX-PERF-03).
- Validation happens when a template is saved (weights 100, bands complete, every rated section has a scale); existing reviews are never re-scored (PF-D7).

### 9.2 Launch and eligibility (J11)
- HR picks the template, scale, population (P19 group), stages with deadlines, and eligibility rules; the pre-flight check runs (§6.3).
- On launch every person in the population gets a `review_eligibility` row from the rules: cut-off joiners excluded (or routed to probation), mid-cycle joiners with months served, leavers closed without a rating unless the company opts in, transfers with input from both managers, **protected leave counted as served and never rated down** (YX-PERF-21). Overrides need a reason.
- Cycles of different kinds may overlap (PF-D4). One employee has at most one review per cycle.

### 9.3 Stages (P03 underneath)
- Each stage has an owner rule, a deadline and an optional flag. P03 sends reminders and escalates overdue stages (YX-PERF-06).
- **Self:** the employee answers their sections.
- **Peer / 360°:** §10.
- **Manager:** the current manager rates every rated section and gives an overall comment. With `perf.self_review.visible_to_manager = after_manager_draft`, the manager sees the self review once they have saved their own first draft, to reduce anchoring.
- **Skip-level:** the manager's manager reviews, may comment, and either agrees or sends it back to the manager with a reason. The skip-level does not overwrite the manager's rating; disagreements go to calibration.
- **Calibration:** §11.
- **Release:** HR releases the cycle (or a signed-off session, with `per_session`). Only then does the employee see the rating, band and manager comments (YX-PERF-09).
- **Acknowledgement:** the employee acknowledges and may add a comment; the rating does not change. A **disagreement** flag opens `review_disagreements` for HR within `perf.disagreement.days`; HR records the outcome, and a changed rating goes through a reopen with a reason (audited).
- The employee always sees the current stage, its owner and the next step (U73).

### 9.4 Manager change mid-cycle (D7)
On an M01 manager change or exit, each in-flight artefact moves on the effective date and is logged in `perf_owner_transfers`: pending manager stage, nominations awaiting approval, comp proposals, PIP ownership, 1:1 shared notes and open actions, and goals parented to the old manager's personal goal (a re-parent prompt). Calibration sessions the old manager facilitated wait for HR. The old manager can be added as a named "other" reviewer while still employed. The new manager gets **cycle-scoped read-back** of the current cycle for the new report. Both see the hand-over list (PRF-13).

### 9.5 Probation reviews
M01 probation reviews use a `probation` template from this engine: one manager stage, the outcome fields M01 already has (confirm / extend / end) and the template's questions. The M01 `probation_reviews` row links to the review.

---

## 10. Peer and 360° feedback

### 10.1 Nominations
- The employee nominates between the cycle's minimum and maximum; the manager approves, declines or adds; HR can add (Q4). P03 `perf.nomination` carries the manager approval.
- Only approved nominees can answer, and only within the stage deadline (YX-PERF-04, PF-D1).
- A person blocked from reviewing the employee (§15.3) does not appear in the picker; the picker never says why.

### 10.2 Anonymity (Q4, YX-PERF-05)
- Per cycle: peers and direct reports **anonymous** by default; the manager and skip-level are named.
- Anonymous answers are shown only for a relationship group with at least `perf.anonymity.min_responses` (starter 3) **submitted** responses.
- Below the minimum, the group is merged into "Others" if the merged group reaches the minimum; otherwise it is held back and the manager sees "not enough responses to show".
- Anonymous ratings are shown as a group average and range, never per person. Comments are shown in random order, without timestamps.
- An anonymous answer that names the reviewer in its text is the reviewer's choice; we do not scrub text.

### 10.3 Who can ever know the author
`review_entries.author_user_id` is kept for one purpose: investigating abuse (threats, harassment). No screen or export shows it. A holder of `perf.feedback.investigate` (in no template by default) can reveal one entry's author with a written reason; it notifies the company's System Admin and is audited.

---

## 11. Calibration

### 11.1 Sessions
- HR creates a session for a group (department, level or P19 group) with a facilitator and attendees (managers of the people in it).
- The board shows each review's manager rating, the band distribution against the **guide**, and the self and skip-level indications. It does not show pay (pay is in the comp review).
- **Changes:** drag a person to another band or type a score; a reason is required; every change is a `calibration_changes` row (YX-PERF-08).
- **Sign-off:** the facilitator signs off (P03 `perf.calibration` when the company wants a second sign-off). Reviews in the session become `ready`.

### 11.2 Distribution guide (guide only)
- The guide is a target share per band with a tolerance. The board shows the actual distribution next to it and a soft note when a band is outside the tolerance.
- It never blocks sign-off and never moves anyone (Q5). Groups below the small-group threshold show no distribution chart, only the list.
- People on protected leave (J11) are not counted in the distribution.

---

## 12. From ratings to pay

### 12.1 The comp cycle
- One comp cycle per legal entity and pay currency, usually linked to a review cycle, with an **effective date** (for example 1 April) and budgets per department or cost centre for merit, bonus and promotion.
- Each eligible employee gets a proposal row pre-filled from the released (or calibrated) band, current pay (`compensations`), the grade range (`grade_pay_ranges`) and eligibility proration (J11).

### 12.2 Merit matrix
- **Compa-ratio** = current annual pay ÷ the grade range's midpoint on the effective date, for the employee's entity and currency. Without a range the matrix uses the rating only (Q6).
- The matrix cell (band × compa-ratio range) gives a minimum, target and maximum %. The proposal starts at the target %, prorated by eligible months (protected leave counts as served).
- A proposal outside the cell's range, or a promotion, needs a justification and an extra approval step (YX-PERF-10).

### 12.3 Bonus
- Optional per comp cycle. The bonus pool per department is split by rating: each person's share = target bonus (from the employee's grade or a cycle-wide %) × the band's multiplier, scaled to fit the pool. Managers can move amounts within their pool with a reason.
- This is a **performance bonus**, separate from the statutory bonus under the Payment of Bonus Act, which payroll computes itself (M03 `IN.BONUS`).

### 12.4 Budgets
- Used = Σ annualised merit increases (and promotion increases, if budgeted together) of approved and submitted proposals; remaining = budget − used. Bonus budgets count bonus amounts.
- With `perf.comp.budget_overrun = extra_approval` (starter), going over adds a finance step; with `block`, the proposal cannot be submitted.

### 12.5 Approvals
- Managers propose for their reports (they see team pay only inside the comp cycle they own, Q6, audited). P03 `perf.comp` routes: manager's manager → HR → finance (finance holders of `perf.comp.approve` for the entity), plus the extra step for out-of-range or over-budget items.
- Proposals are approved in bulk per department, with per-row exceptions.

### 12.6 Hand-off to payroll and letters
When the comp cycle is approved, HR **applies** it. In one transaction:
1. Merit and promotion rows become P06 changes (`salary_revision`, or `promotion` with the new grade and designation and the new pay) in **bulk batches** (`source = comp_review`), effective on the cycle date. A batch holds at most 1,000 rows (M01), so a larger cycle is split into several batches of up to 1,000, each linked to the comp cycle (`employee_change_batches.comp_cycle_id`, added in PM7). All batches, bonuses and letters of one apply are created in **one transaction**: either every row is applied or none is, and a retry after a failure starts clean. They are already approved by the comp chain, so the batches are created approved, and the change log shows the comp cycle as their approval.
2. With `perf.comp.effective_basis = cycle_date` (starter), a date already in a processed payroll month becomes a back-dated change. P06 classifies it, and **M03 pays arrears in the next run** per month and component (M03-BUILD §7.6). Nothing in M06 computes arrears.
3. Bonus amounts become `one_time_pays` (source `m06`, component `perf_bonus`, the chosen pay month), approved, so the next run pays them.
4. Letters are issued from P05 templates (increment, promotion; optionally one appraisal-outcome letter that states the rating and the new pay), in the employee's language where a translation exists, and released to the employee's documents.
5. Each proposal keeps its `change_id`, `one_time_pay_id` and `letter_id`; the cycle becomes `applied`.

Re-applying is refused. A wrong row after applying is fixed by a normal P06 correction, never by editing the proposal.

### 12.7 Own pay band and pay equity
- **Own pay band (T4, PAY-39):** with `perf.pay_band.visible = on`, an employee sees their own grade's min / mid / max and their position (below / within / above, quartile). Never anyone else's pay; "no range set" when there is none.
- **Pay-equity panel (C3, YX-PERF-18):** inside the comp cycle, HR and finance approvers see the gap by gender, grade, role and location (mean and median, raw and adjusted), before and after the proposals. Cells below the small-group threshold show "suppressed", in exports too. A person below their grade-and-role median by more than the company threshold (starter 10 %) is flagged for the reviewer; nothing changes automatically. Managers see only the "after" gap for their own team, with suppression.

---

## 13. PIPs

- **Start:** the manager proposes a PIP (reason, expectations with measures, support offered, length 30 / 60 / 90 days, check-in frequency). HR approves through P03 `perf.pip` (YX-PERF-11).
- **Not while protected:** a PIP cannot start, and an active one pauses (its end date moves), while the employee is on protected leave (maternity, long medical leave), and HR is warned when the employee has an open POSH matter as complainant or witness (§15.3: a possible retaliation risk). The warning never says why; HR checks with the case owner.
- **Acknowledgement:** the employee sees the plan, can comment and acknowledges it (they can acknowledge without agreeing). A PIP letter is issued from P05.
- **Check-ins:** fixed dates from the start. Each check-in has a manager note and an optional employee note. Missed check-ins are recorded, and HR is told.
- **Outcome:** met, extended (once, with a new end date and a reason) or not met. "Not met" shows HR a **"Start an exit case"** action that opens a company-initiated M01 exit linked to the PIP (§4.1 change 4). It never starts one by itself.
- **Visibility:** the employee, the manager chain and HR in scope (Q7). Never shown to peers, never on the profile overview, never in reports below the small-group threshold.
- A PIP is not a disciplinary case (M08); misconduct goes there instead.

---

## 14. Privacy and who sees what

### 14.1 Visibility matrix

| What | Employee | Manager chain | Skip-level | Peers / nominees | HR in scope | Calibration attendees |
|---|---|---|---|---|---|---|
| Own goals and check-ins | ✔ | ✔ | ✔ | Aligners see the goal title and progress only | ✔ (`perf.goal.view`) | — |
| Feedback items (`private`) | ✔ recipient | ✔ | ✔ | Giver sees what they gave | ✔ | — |
| 1:1 shared notes | ✔ | the two people only | — | — | — (not by default) | — |
| 1:1 private notes | author only | author only | — | — | never | — |
| Self review | ✔ | after their draft (setting) | ✔ | — | ✔ | ✔ summary |
| Peer answers | grouped, after the minimum | grouped, after the minimum | grouped | own answer only | grouped (never the author) | grouped |
| Manager rating before release | — | ✔ | ✔ | — | ✔ | ✔ |
| Calibrated / final rating | after release | ✔ | ✔ | — | ✔ | ✔ |
| Comp proposal | after apply (letter) | inside the comp cycle they own | inside the cycle | — | ✔ (`perf.comp.manage`) | — |
| PIP | ✔ | ✔ | ✔ | — | ✔ (`perf.pip.manage`) | — |

- **Manager chain** means the current manager and their managers on the date, plus the D7 read-back for a new manager. Dotted-line managers can give feedback but do not see ratings (M01 Q5).
- HR in scope: holders of `perf.review.view` for the employee (P02 scope).
- Every view of another person's rating or comp proposal by a non-manager is recorded in the access log (P02 "who accessed my data").

### 14.2 Reports
Reports (§19, EXP-style) are scoped by the viewer's grants. Breakdowns of ratings by gender, age band or any small group follow YX-MET-04: below the threshold they show "suppressed" for viewers without individual access, in exports too.

---

## 15. India points

India has **no law that sets how appraisals must be done**, so these are good-practice and adjacent-law points, in our own words. Items marked *verify* go to the compliance owner.

### 15.1 Fairness
- **Written criteria:** the template, scale, bands and matrix in force for each cycle are frozen and kept, so any decision can be traced to the rules used.
- **Reasons:** every calibration change, out-of-range proposal, override and reopen carries a reason.
- **Equal pay:** the Code on Wages 2019 forbids pay discrimination on gender for the same or similar work; the pay-equity panel (§12.7) helps finance check it before approving (*verify*).
- **Maternity:** the Maternity Benefit Act protects women on maternity leave; the protected-leave rule (J11) counts the leave as served and never rates it down (*verify*).
- **Disability:** the Rights of Persons with Disabilities Act 2016 forbids discrimination; templates can carry an "accommodation considered" note, and no rating field uses disability data (*verify*).

### 15.2 Record keeping
- Released reviews, calibration changes, comp decisions and PIPs are never deleted by the app; they are closed or superseded.
- **Retention** follows P05 rules: the starter keeps final ratings, comp decisions and PIP outcomes with the employment record, and peer comments and 1:1 notes for the employment plus 3 years, then removes the text and keeps the fact that it existed (D13, *verify*).
- The **DPDP Act 2023** lets an employee ask what is held about them: the access answer includes their own goals, feedback received, released reviews (peer answers grouped as shown), PIPs and letters; it excludes other people's private notes and reviewer identities.

### 15.3 POSH-sensitive handling
Under the POSH Act 2013, a complaint of sexual harassment belongs to the Internal Committee, its identities are confidential, and the complainant and witnesses must not be victimised.
- **Report a concern:** every feedback, 1:1 and review form has a "Report a concern instead" link to the confidential concern channel (M08 POSH intake; until M08 ships, the HR confidential intake). Nothing typed in the performance form is sent there automatically; the person starts afresh in the channel.
- **No automatic detection:** we do not scan feedback text for harassment words. False flags would harm people and expose private text (D11).
- **Moving a misplaced item out:** if HR finds that a feedback item or review comment reports harassment, HR can **seal** it: it disappears from the review and from every report, a placeholder says "removed by HR", and the text is kept only for the confidential channel. Sealing needs a reason and is audited.
- **Reviewer blocks:** when the case owner asks, HR adds a `reviewer_blocks` pair (`confidential_matter`) so the complainant and respondent cannot review each other or sit in each other's calibration. The reason is never shown.
- **Retaliation guard:** while a block is active, a downgrade in calibration, a below-matrix comp proposal or a PIP for either person shows HR a warning to check with the case owner. It is a warning, not a block, and it says nothing about the case.
- Case details from M08 are never read by this module (YX-POSH-05); only the block pair and its dates are.

---

## 16. Global points

### 16.1 Countries
- **Pay:** comp cycles are per legal entity and pay currency; matrices and budgets are in that currency. Multi-currency budgets are summed only within one currency.
- **Works councils (for example Germany, France, the Netherlands):** appraisal systems and criteria are often subject to consultation or co-determination. The frozen template version and the change log support this; a country pack can mark templates as "needs works council sign-off" before launch (*verify per country*).
- **Data protection (GDPR, UK GDPR):** the employee access answer is as in §15.2; reviewer identity protection is weighed against access, so peer answers stay grouped. Purpose limitation: performance data is not used for unrelated decisions, and the AI rules in §16.4 apply.
- **Pay transparency (EU Directive 2023/970):** the pay-gap hooks (T4) and the own pay band already point that way; the legal report packs come with the first EU customer (§3.2).
- **Languages:** templates, labels and letters are per language (§6.4). Free text stays as written.

### 16.2 What large HR suites show that matters here (public information only)
Large suites offer continuous check-ins next to annual reviews, goal alignment maps, talent review grids and calibration with distribution views. We keep the parts that help a company decide fairly (alignment, calibration with reasons, comp matrix with budgets), in simpler form.

### 16.3 Do not copy
- **Forced ranking or a bell curve as the default.** *Ours:* a guide only; enforced distribution is an opt-in for wave 6.
- **Long performance "documents" with many hidden states and step types.** *Ours:* a few fixed stages with an owner, a deadline and a visible next step.
- **Score formulas written as code.** *Ours:* weights and bands as data, checked on save.
- **Ratings visible across peers or in a public profile.** *Ours:* Confidential, released only to the employee.
- **360° for everyone, every cycle.** *Ours:* optional per cycle, with nominations and a minimum response count.
- **A separate talent profile that duplicates the employee record.** *Ours:* the employee record plus the skills library.

### 16.4 AI (a later seam, nothing built)
Possible later uses: help a manager draft review text, flag biased wording, summarise feedback, suggest skills (P23 PRF-16 / 17, T2). **None is built in this design.** When built, they follow P10 and P23: opt-in per company, advisory only, the manager's text and rating stay final, Confidential data masked, Special data never sent out, and no AI output feeds a score, calibration, pay or PIP decision. The seam is an interface (`ReviewWritingAssistant`) with a "none" adapter only (D12).

---

## 17. Permissions

### 17.1 New keys (P02, scoped like employee records unless stated)

| Key | Who | Gives |
|---|---|---|
| `perf.setup.manage` | HR (company-wide) | Scales, templates, competencies, skills, matrices, settings |
| `perf.goal.view` | HR, department heads | Goals of people in scope (read) |
| `perf.goal.manage` | HR (company-wide) | Goal periods, company and team goals (PM2) |
| `perf.cycle.manage` | HR (tenant / entity) | Create, launch, release, reopen and close cycles; eligibility overrides |
| `perf.review.view` | HR | Reviews and ratings of people in scope, before and after release |
| `perf.calibration.facilitate` | HR, senior leaders | Run calibration sessions for groups in scope |
| `perf.comp.manage` | HR (tenant / entity) | Comp cycles, budgets, proposals of the entity; apply |
| `perf.comp.approve` | Finance (tenant / entity) | The finance step of comp approvals; pay-equity panel |
| `perf.pip.manage` | HR | Approve, see and close PIPs in scope |
| `perf.report.view` | HR, leaders | Performance reports in scope, with suppression |
| `perf.feedback.investigate` | Named person only | Reveal one anonymous author with a reason (§10.3) |
| `perf.concern.seal` | HR (POSH-trained) | Seal a feedback item or comment and manage reviewer blocks (§15.3) |

**Implicit grants (no key):** my own goals, feedback, 1:1s, reviews (after release) and PIP; my reports' goals, reviews and PIPs through the manager chain; tasks I hold in P03; a nominee's own answer.

### 17.2 Role templates
- **HR Admin** gains `perf.goal.view`, `perf.cycle.manage`, `perf.review.view`, `perf.calibration.facilitate`, `perf.pip.manage`, `perf.report.view`.
- **Performance set-up** (new, company-wide): `perf.setup.manage`.
- **Compensation planner** (new, entity): `perf.comp.manage`.
- **Finance Approver** gains `perf.comp.approve`.
- `perf.feedback.investigate` and `perf.concern.seal` are in no template by default.

### 17.3 MFA
`perf.comp.manage`, `perf.comp.approve`, `perf.feedback.investigate` and `perf.concern.seal` need a second factor.

---

## 18. Events, notifications, jobs

### 18.1 Events (APX-B, thin payloads, same transaction)
`perf.goal.approved`, `perf.cycle.launched`, `perf.review.stage_due`, `perf.review.released`, `perf.review.disagreed`, `perf.calibration.signed_off`, `perf.comp.approved`, `perf.comp.applied`, `perf.pip.started`, `perf.pip.closed`, `perf.skill_gap.found` (→ M07).

Consumed: `employee.manager_changed` and `employee.exit` (M01, for D7 transfers), `leave.protected.started` / `.ended` (M02, J11 and PIP pause), `employee_change.applied` (P06, to mark proposals applied), `posh.block.set` / `.cleared` (M08, when built).

### 18.2 Notifications (P04)
- **Employee:** goals approved or returned, feedback received, 1:1 reminder, stage open and due, rating released, PIP plan to acknowledge, PIP check-in due.
- **Manager:** goals to approve, nominations to approve, manager stage due, hand-over list after a team change, comp proposals due.
- **Nominee:** feedback requested, reminder before the deadline.
- **HR:** overdue stages, disagreements, PIP missed check-ins, retaliation-guard warnings (§15.3, no case details).
Ratings and pay never appear in email; the email says there is something to see in the app (P04 Q6).

### 18.3 Jobs (`perf-jobs.ts`)
- **Daily:** stage reminders and escalations, check-in and 1:1 reminders, PIP check-in schedule, disagreement window close, protected-leave pause and resume.
- **On launch:** eligibility rows and review rows in batches of 500, with progress on the control room.

---

## 19. API

All routes are under `/api/v1/performance`. Writes take `version`.

| Area | Endpoints |
|---|---|
| Set-up | `GET,POST,PUT /scales` · `GET,POST,PUT /templates` (+ `/new-version`) · `GET,POST,PUT /competencies` · `GET,POST,PUT /skills` · `GET,POST,PUT /matrices` · `POST /setup/from-starter` · `GET /setup-check` |
| Goals | `GET /goals?owner=&period=` · `POST /goals` · `PUT /goals/:id` · `POST /goals/:id/submit` · `POST /goals/:id/checkins` · `GET /goal-map?period=` |
| Feedback | `GET /feedback?view=received\|given` · `POST /feedback` · `POST /feedback/:id/withdraw` · `POST /feedback-requests` |
| 1:1s | `GET,POST /one-on-ones` · `GET,PUT /one-on-ones/:id` · `POST /one-on-ones/:id/agenda\|actions\|private-notes` |
| Cycles | `GET,POST /cycles` · `PUT /cycles/:id` · `POST /cycles/:id/preflight\|launch\|release\|close` · `GET /cycles/:id/funnel` · `GET /cycles/:id/eligibility` · `PUT /eligibility/:id` (override) |
| Reviews | `GET /reviews?view=mine\|team\|scope&cycle=` · `GET /reviews/:id` · `PUT /reviews/:id/entries/:stage` (draft) · `POST /reviews/:id/entries/:stage/submit` · `POST /reviews/:id/send-back` · `POST /reviews/:id/acknowledge` · `POST /reviews/:id/disagree` · `POST /reviews/:id/reopen` |
| 360° | `GET,POST /reviews/:id/nominations` · `POST /nominations/:id/approve\|decline` · `GET /my-feedback-tasks` |
| Calibration | `GET,POST /calibration-sessions` · `GET /calibration-sessions/:id` · `POST /calibration-sessions/:id/changes` · `POST /calibration-sessions/:id/sign-off` |
| Comp | `GET,POST /comp-cycles` · `PUT /comp-cycles/:id/budgets` · `GET /comp-cycles/:id/sheet` · `PUT /comp-proposals/:id` · `POST /comp-cycles/:id/submit` · `POST /comp-cycles/:id/apply` · `GET /comp-cycles/:id/pay-equity` · `GET /me/pay-band` |
| PIPs | `GET,POST /pips` · `GET /pips/:id` · `POST /pips/:id/acknowledge\|checkins\|outcome\|start-exit` |
| Privacy | `POST /feedback/:id/seal` · `POST /review-entries/:id/seal` · `GET,POST,DELETE /reviewer-blocks` · `POST /review-entries/:id/reveal-author` |
| Reports | `GET /reports/:kind?cycle=&format=csv` (completion, distribution, calibration changes, goal alignment, comp vs budget, PIP status) |
| Hand-over | `GET /handover?employee=` |

Every route is added to `endpoint-permissions.spec.ts`.

---

## 20. Screens

### 20.1 Wired from the prototypes (`screens/growth/perf-*.tsx`)

| Screen | Batch | Gaps to fix while wiring |
|---|---|---|
| PRF-14 Competency framework; Settings 6.3 (scales, templates, matrices) | PM1 | Template editor with weights check and live band preview; "in use" items can only be retired |
| PRF-01 Performance home, PRF-02 My goals + check-in, PRF-03 Company goal map | PM2 | Progress calculated server-side; weights warning; cycle refused on align |
| PRF-08 Quick feedback, PRF-11 1:1s | PM3 | "Report a concern instead" on every form; private notes clearly marked "only you" |
| PRF-04 Cycle set-up + control room, PRF-05 Review workspace, PRF-06 Acknowledgement, PRF-13 Hand-over, PRF-15 Disagreement | PM4 | Pre-flight check; clickable funnel to names (U74); stage owner and next step always shown |
| PRF-07 Nominations | PM5 | Min / max, blocked people hidden without a reason |
| PRF-09 Calibration board | PM6 | Guide only, no forced moves; distribution hidden for small groups; reason box required |
| PRF-10 Comp review sheet, PAY-39 My pay band | PM7 | Budget bar per department; out-of-range rows marked; apply preview (changes, bonuses, letters, arrears months) |
| PRF-12 PIP record | PM8 | Protected-leave pause; "Start an exit case" only after "not met" |
| PRF-16 / PRF-17 (coach card, "Help me draft") | — | **Not wired**: AI seam only (§16.4) |

### 20.2 Rules every screen follows (standing YukthiX rules)
- Every clickable control looks clickable (border or fill, hover, pointer, focus ring).
- A single choice of 2–4 options uses the Segment control, never chips.
- No red error while typing; errors show after Save.
- Scores always show with their band; missing inputs say "pending", never 0.
- Mobile: goal check-in, quick feedback, 1:1 agenda, acknowledgement, PIP acknowledgement.

---

## 21. Security

- Server-side scope checks on every read and write (P02); someone without a reason to see a review gets "not found".
- Ratings, comments and comp data never go to logs, emails or push notifications.
- Peer answers grouped server-side; the API never returns `author_user_id` except through the audited reveal.
- The comp sheet only returns pay for employees in the requester's own comp scope; each view is in the access log.
- CSV exports use the formula guard (cells starting `=`, `+`, `-`, `@` are quoted) and suppression.
- Sealed items are excluded at the query level, not hidden in the UI.
- Approval chains are server-side; a client-chosen approver does not exist; maker ≠ checker on comp approval.
- Rate limits on feedback creation (per person per hour) to stop spam.

---

## 22. Build order (PR-sized slices)

### 22.1 Batch PM1 · Set-up: scales, templates, competencies (5 slices)

| ID | Slice | Tests |
|---|---|---|
| PM-1.01 | Migration PM1, RLS; keys `perf.setup.manage`; Performance set-up template; settings `perf.*` | e2e: RLS isolation for every table; a non-holder is refused |
| PM-1.02 | Scales, levels, bands; band coverage check | unit: bands with a gap or overlap are refused; half-point scale |
| PM-1.03 | Templates, sections, questions; weight check; versions; P19 "applies to" | unit: weights ≠ 100 refused (PF-D7); e2e: editing a used template makes a new version and leaves reviews untouched |
| PM-1.04 | Skills library (first form), competencies, levels, role map; starters; G1 translations for labels | e2e: starters copied once; an in-use competency can be retired, not deleted; Tamil reader sees translated level labels |
| PM-1.05 | Screens PRF-14 and Settings 6.3 wired | Playwright: HR builds a template whose weights must reach 100 |

### 22.2 Batch PM2 · Goals and OKRs (4 slices)

| ID | Slice | Tests |
|---|---|---|
| PM-2.01 | Migration PM2; goals, key results, periods; owners and alignment | unit: progress from KRs and from children (YX-PERF-01); cycle in the parent chain refused; e2e: Arjun's KR aligns under Priya's team goal (U70) |
| PM-2.02 | Goal approval (P03 `perf.goal_set`), target change after approval | e2e: manager approves; employee cannot approve own; changed target needs a reason |
| PM-2.03 | Check-ins, confidence, history; reminders job | e2e: a check-in updates progress, never typed when KRs exist (U71) |
| PM-2.04 | Screens PRF-01, PRF-02, PRF-03 wired | Playwright: create, align, check in |

### 22.3 Batch PM3 · Feedback and 1:1s (4 slices)

| ID | Slice | Tests |
|---|---|---|
| PM-3.01 | Migration PM3; quick feedback, visibility, withdraw window, requests | e2e: private feedback seen by the recipient and their manager, not by a peer; withdraw after 24 h refused |
| PM-3.02 | 1:1s: agenda, shared notes, private notes, actions linked to goals, series reminders | e2e: private notes readable only by the author, also not by HR; open actions carry to the next 1:1 |
| PM-3.03 | Concern route and sealing (`perf.concern.seal`), audit | e2e: a sealed item disappears from the review and reports; the placeholder shows; the reason is audited |
| PM-3.04 | Screens PRF-08, PRF-11 wired (mobile too) | Playwright: give feedback on a phone width; "Report a concern instead" opens the concern channel |

### 22.4 Batch PM4 · Review cycles (8 slices)

| ID | Slice | Tests |
|---|---|---|
| PM-4.01 | Migration PM4; cycles, pre-flight check, launch job | e2e: launch refused with a manager-less employee; 500+ reviews created in batches |
| PM-4.02 | Eligibility rules (J11) and overrides | unit: Feb joiner excluded with a 3-month cut-off, July joiner 9/12, maternity counted as served (YX-PERF-21) |
| PM-4.03 | Self and manager stages via P03; deadlines, reminders, escalation; self visible after manager draft | e2e: the employee sees "Manager review pending", not 0.4/5 (U69); manager sees the self review only after saving a draft |
| PM-4.04 | Scoring (weighted / manager overall), excluded sections named, bands | unit: missing section excluded with a warning (YX-PERF-02); band mapping |
| PM-4.05 | Skip-level stage and send-back | e2e: skip-level cannot overwrite the rating; send-back returns to the manager with a reason |
| PM-4.06 | Release, acknowledgement, disagreement, reopen | e2e: nothing visible to the employee before release (YX-PERF-09); acknowledgement keeps the rating; reopen needs a reason and is audited |
| PM-4.07 | Manager change hand-over (D7) and probation template | e2e: Ravi's pending manager stage moves to the new manager, who reads the current cycle; old manager's private notes stay hidden; probation review overlaps the annual cycle (PF-D4) |
| PM-4.08 | Screens PRF-04, PRF-05, PRF-06, PRF-13, PRF-15 wired | Playwright: self → manager → release → acknowledge; funnel counts open the names (U74) |

### 22.5 Batch PM5 · Peer and 360° (3 slices)

| ID | Slice | Tests |
|---|---|---|
| PM-5.01 | Migration PM5; nominations (min / max), manager approval (P03), reviewer blocks | e2e: an unrelated employee cannot answer Meera's review (PF-D1); a blocked pair is not offered and cannot be added |
| PM-5.02 | Anonymity grouping with the minimum, merge into "Others", hold back; audited author reveal | unit: 2 peers + 1 report → "Others" with 3; 2 alone → held back; e2e: the API never returns an author; reveal needs the key, a reason and notifies the System Admin |
| PM-5.03 | Screen PRF-07 wired; peer panel labelled "advisory" in PRF-05 | Playwright: nominate, approve, answer, see grouped results after release |

### 22.6 Batch PM6 · Calibration and reports (4 slices)

| ID | Slice | Tests |
|---|---|---|
| PM-6.01 | Migration PM6; sessions, guide, changes with reasons, sign-off | e2e: 4 → 3 needs a reason; the employee sees only the released 3 (YX-PERF-08); sign-off never blocked by the guide |
| PM-6.02 | Distribution with suppression; protected-leave people not counted | unit: a group of 4 shows no chart; protected leave excluded |
| PM-6.03 | Reports (completion, distribution, calibration changes, goal alignment, PIP status) with CSV and suppression | e2e: report totals equal the reviews; small cells suppressed in the CSV |
| PM-6.04 | Screen PRF-09 wired; reports page | Playwright: drag a person to another band with a reason |

### 22.7 Batch PM7 · From ratings to pay (7 slices; needs §4.1 changes 1, 3, 5)

| ID | Slice | Tests |
|---|---|---|
| PM-7.01 | Migration PM7; comp cycles, budgets, matrices with tiling check; keys and templates | unit: matrix cells with a gap refused; e2e: RLS and support exclusion |
| PM-7.02 | Proposal sheet: compa-ratio, matrix suggestion, proration, out-of-range | unit: "Exceeds" with compa 0.85 suggests 10–14 %; 20 % asks for a justification and an extra step (YX-PERF-10); a July joiner's merit prorated 9/12 |
| PM-7.03 | Budgets: used and remaining, overrun rule | e2e: over-budget adds the finance step (`extra_approval`) or blocks (`block`) |
| PM-7.04 | Bonus pool split by band multiplier | unit: shares scale to fit the pool; manager moves within the pool need a reason |
| PM-7.05 | Approval chain (P03 `perf.comp`), team-pay visibility only inside the cycle, access log | e2e: a manager sees team pay only in their own comp cycle; maker ≠ checker on the finance step |
| PM-7.06 | Apply: P06 bulk batches split at 1,000 rows in one transaction, one-time bonuses, letters; back-dated date → arrears by payroll | e2e: applying creates `salary_revision` changes effective 1 Apr, a `perf_bonus` one-time pay and letters; a 2,300-person cycle makes 3 linked batches, and a failure on the last one leaves none applied; a 1 Apr date approved in June shows arrears for April–May in the next run (M03); re-apply refused |
| PM-7.07 | Own pay band (PAY-39), pay-equity panel with suppression; screens PRF-10 wired | e2e: an employee sees only their own band; a 3-person cell shows "suppressed" in the panel and the export; Playwright: propose, approve, apply |

### 22.8 Batch PM8 · PIPs (3 slices; needs §4.1 change 4)

| ID | Slice | Tests |
|---|---|---|
| PM-8.01 | Migration PM8; PIP proposal, HR approval (P03 `perf.pip`), letter, acknowledgement | e2e: a manager cannot start a PIP without HR; the employee acknowledges with a comment |
| PM-8.02 | Check-ins, missed check-ins, protected-leave pause, retaliation-guard warning | e2e: maternity leave moves the end date; a blocked pair shows HR the warning without case details |
| PM-8.03 | Outcomes and "Start an exit case"; screen PRF-12 wired | e2e: "not met" never opens an exit by itself; HR's action opens a company-initiated exit linked to the PIP; Playwright: PIP to outcome |

Every batch ends with the usual checks: typecheck, unit, the batch's e2e and the RLS suite, Playwright, the affordance guard and a fresh-database migration.

---

## 23. Decisions for the founder

**Accepted 12 Oct 2026.** The founder accepted D1–D14 with the recommended defaults (bold).

### D1 · Where competencies live at launch
- A: **Build the first form of the company skills library now and make competencies a view of it (T2 from day one).**
- B: A separate competencies table now, merged into the skills library later (a migration later).

### D2 · Goal approval
- A: **The manager approves a person's goals each period (company can switch off).**
- B: No approval; goals are agreed in 1:1s.

### D3 · When the manager sees the self review
- A: **After saving their own first draft (less anchoring).**
- B: As soon as the employee submits it.

### D4 · Anonymous peer answers below the minimum
- A: **Merge into "Others" if that reaches the minimum, else hold back.**
- B: Always hold back below the minimum.
- C: Show them anyway with a warning (not recommended).

### D5 · Releasing ratings
- A: **Release the whole cycle at once after calibration.**
- B: Release each calibration session as it is signed off.

### D6 · Effective date of merit increases
- A: **The cycle date (for example 1 April); if approval is later, payroll pays arrears in the next run.**
- B: The first day of the month after approval (no arrears; people approved late lose months).

### D7 · Budget overrun
- A: **Allowed with an extra finance approval.**
- B: Blocked; HR must raise the budget first.

### D8 · Performance bonus
- A: **Paid through payroll as one-time pay in a month HR picks; pool split by rating with manager moves inside the pool.**
- B: Manager discretion within a budget, no rating link.

### D9 · Appraisal outcome letter
- A: **Send the increment or promotion letter only; the rating stays in the app.**
- B: One letter stating rating, band and new pay.

### D10 · PIP and protected situations
- A: **No PIP starts during protected leave and an active one pauses; HR gets a warning (no details) when the person is in a confidential matter as complainant or witness.**
- B: HR decides case by case with no system checks.

### D11 · Harassment disclosures in feedback
- A: **A "Report a concern instead" link on every form and HR sealing; no automatic text scanning.**
- B: Scan text for keywords and flag it to HR (false flags and privacy risk).

### D12 · AI writing assistance (P23 "Help me draft", bias flags, summaries)
- A: **Later: a seam only now; build as an opt-in after the core cycle is live, advisory only.**
- B: Build with this design.
- C: Never.

### D13 · Keeping peer comments and 1:1 notes
- A: **Employment plus 3 years, then remove the text and keep that it existed; final ratings, comp decisions and PIP outcomes stay with the employment record.**
- B: Keep everything for the employment record's full retention.

### D14 · What this design builds
- A: **The launch core here (PM1–PM8); career paths and IDPs, talent pools and the 9-box, attrition risk and market benchmarks in a second M06 design.**
- B: Include career paths and IDPs now (adds about two batches).

---

## 24. Change log

| Date | Change |
|---|---|
| 12 Oct 2026 | PM3 built: key `perf.concern.seal` (org admin; MFA-sensitive; no role template by default); HR read one person's feedback with sealed text only on its own route, which needs the key; the people see "Removed by HR" and the manager chain no longer sees the item; notifications never carry feedback text; 1:1s are one-off meetings between an employee and their current manager (no recurring series yet), with one reminder the day before; open actions move to the pair's next 1:1; "Report a concern instead" opens the Help centre until the M08 confidential intake exists. |
| 12 Oct 2026 | PM2 built: key `perf.goal.manage` added (goal periods, company and team goals; in the company-wide Performance set-up template, since it is a company-wide key); goal statuses `draft` / `submitted` / `active` / `done` / `dropped` (approval makes a goal active, no separate "approved"); a change to an approved goal is kept as a pending change until the manager decides, so the goal stays as it was; one check-in reminder per interval (`checkin_reminded_on`); the goals page serves as PRF-01 until reviews exist (PM4). |
| 12 Oct 2026 | PM7 apply splits comp cycles into bulk batches of up to 1,000 rows in one transaction (§12.6, PM-7.06). Forward migration restating the full translation subject list after expenses and PM1 both changed it. |
| 12 Oct 2026 | PM1 built: the `perf.*` settings keys arrive with the batch that first reads them (none in PM1); a template's P19 "applies to" moves to PM4 with cycle populations; `comp_review` added to bulk change batches (§4.1 change 1); translation subjects added (change 2). |
| 12 Oct 2026 | Founder accepted D1–D14 with the recommended defaults; PM1 started. |
| 12 Oct 2026 | First draft: scope (launch core) and what is left for a second design, reuse and the six small changes in other modules, data model by batch with RLS, settings and starters, goals and OKRs, feedback and 1:1s, cycles with templates and scales as data, eligibility, stages, 360° anonymity, calibration with a guide only, ratings to pay (matrix, budgets, bonus, P06 batch, arrears by payroll, letters, pay band, pay equity), PIPs with the exit link, privacy matrix, India points (fairness, records, POSH), global points and a do-not-copy list, AI as a later seam, permissions, events, API, screens, security, 38 slices in batches PM1–PM8, founder decisions D1–D14. |
