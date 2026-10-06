# T02 · Test Builder, Adaptive Testing & Psychometrics

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026** with GAP-REGISTER **B4** (starter tests, JD-based assembly, sectional cut-offs) and **B15** (equating across parallel forms, cut-score studies) — see §3 "Gap-register extensions" and §11. Personality / behavioural psychometrics are T06; fairness / validity analytics are A13 (not designed here).
> **Covers:**
> - Spec §1.1.2 Test Builder: modes, blueprint, adaptive rules, common settings, lifecycle.
> - Spec §1.1.3 Coding Assessment.
> - Spec §1.1.12 automated scoring. Manual evaluation is in T05.
> - Spec §1.1.13 Psychometrics & Item Analysis.
> - [Reuse inventory](../reference/exam-app-reuse-inventory.md) §1.1.2, §1.1.3, §1.1.12 and §1.1.13.
>
> **Builds on:** T01 (versions, 5-level difficulty, calibrated difficulty, skills), P02, P03 (publish approval), P11 (API).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
- Build fair tests quickly: fixed, randomised or adaptive.
- Make scores **comparable** between candidates who saw different questions.
- Measure question and test quality with standard psychometrics.

## 2. What exists today (exam app) — keep / change / add

| Capability | Today | T02 |
|---|---|---|
| Fixed and randomised pool | `selectionMode fixed / pool`, `poolSize`, `poolDifficulty`, pool tags, preview | **Keep**. **Add** a blueprint object (skill × difficulty counts across sections) |
| Adaptive mode | Missing | **Add** (Q1, Q2) |
| Pass mark, section weights, "answer any N" | Done | **Keep** |
| Per-test marks override | Missing | **Add** (marks per question within the test, default from the bank) |
| Sectional timing | Advisory `targetDurationMinutes` | **Add** an enforced option (Q4) |
| Navigation | Free + mark for review | **Add** forward-only per section (Q4) |
| Retake / reset | Missing (only resend / revoke invite) | **Add** (Q5) |
| Templates | Duplicate test / section | **Add** a template library |
| Versioning + publish approval | Publish / unpublish, no versions | **Add** (Q6) |
| Archive | Unpublish / delete | **Add** an archive state; delete only when there are no attempts |
| Coding | Piston, visible / hidden cases, weighted partial scoring, AI code review, run count | **Keep**. **Add** explicit sandbox limits, SQL, editor policy, full run history (Q8) |
| Auto-scoring, percentile, release modes | Done | **Keep**. **Add** a comparable (scaled) score and a skill breakdown (Q3) |
| Item analysis (p-value, point-biserial, distractors, calibration helper) | Done | **Keep**. **Add** Cronbach's α, IRT, exposure control (Q2, Q7) |

## 3. Concepts
- **Test mode:**

  | Mode | What it does |
  |---|---|
  | **Fixed** | Same questions, same order (option shuffle allowed) |
  | **Randomised** | Questions drawn per the blueprint from pools |
  | **Adaptive** | The next question depends on the previous answers (Q1) |

- **Blueprint:** skill × difficulty → number of questions (and marks), per section. It is validated against **pool depth**: each cell must have at least `k` approved items (default k = 3× the count drawn), so candidates don't all get the same items.
- **Test version:** a published snapshot of settings, blueprint and pinned question versions (T01). Invited candidates stay on the version they were invited to (Q6).
- **Scores:**

  | Score | Meaning |
  |---|---|
  | **Raw score** | Marks earned |
  | **Scaled score** | Comparable across forms and adaptive paths (Q3) |
  | **Ability estimate (θ)** | For IRT-calibrated tests |
  | **Percentile** | Within a cohort (drive / job / all takers) |
  | **Skill breakdown** | Per T01 skill |

- **Item statistics:** difficulty index (p), discrimination (point-biserial), distractor analysis, IRT parameters (Q2), exposure rate (Q7). **Test statistics:** Cronbach's α, score distribution, section correlation.

### Gap-register extensions (26 Sep 2026; Proctoring track, phase 2)
- **Starter test library (B4):** YukthiX-maintained, ready-made tests per **job role × level** (T01 job-role profiles, YX-QB-13), assembled only from the starter question library (T01 Q7): sections, blueprint, timing, sectional cut-offs and a suggested proctoring mode. Labelled "YukthiX starter", read-only; a tenant **copies** one into its own test (a new draft, own versioning) and edits it (D17). The template library (§2) shows starter tests next to the tenant's own templates.
- **AI test assembly from a job description (B4):**
  1. The recruiter pastes or picks a JD (from the M10 job, or free text).
  2. AI extracts skills and seniority, mapped to the T01 taxonomy (or matched to a job-role profile); the recruiter confirms / edits the skill list and weights.
  3. AI proposes a **blueprint** (sections, skill × difficulty counts, timing, cut-offs) checked live against pool depth.
  4. A **draft test** is filled from approved tenant + starter items; cells without enough items show a gap and can request AI question drafts (T01 Q8, always draft, human review).
  5. Human review, then the normal publish path (YX-TB-01, Q6). AI credits are metered per run (P10).
- **Sectional cut-offs (B4):** each section may have its own **pass mark** (on the section's scaled or percent score) in addition to the overall pass mark. The overall result is "pass" only when the overall mark and every enabled section cut-off are met. Cut-offs apply to the combined outcome used by T05 release and ATS rules.
- **Parallel forms & equating (B15):** a fixed test can have **parallel forms** (A, B, C …) built from the same blueprint and sharing **anchor items** (default ≥ 20 % of items, minimum 10). Forms are linked onto the base form's scale by **IRT linking on the anchors** (Stocking–Lord, 2PL per Q2), and each candidate gets a **form-level scaled score** comparable across forms. Until each form has the Q2 minimum responses, scaled scores use provisional equating (authored difficulty) and are marked "provisional".
- **Cut-score studies (B15):** for certification tests, the pass mark is set by a documented **standard-setting study** with an SME panel:
  - **modified Angoff:** each SME estimates, per item, the probability that a *minimally competent candidate* answers correctly; two or more rounds with discussion and impact data (pass rate at the proposed cut) between rounds;
  - **bookmark:** SMEs place a bookmark in an ordered item booklet (items sorted by IRT difficulty) where a minimally competent candidate would stop succeeding;
  - panel size, rounds and method are a company-configured policy (starter template: modified Angoff, 5 SMEs, 2 rounds; D17). The result is a recommended cut ± SE, approved by the test owner through P03.
- **Simulation and role-play tests (T13).** A test section can hold T01 simulation and AI role-play items: an **in-tray section** with one shared time limit across the inbox, a **multi-turn role-play section** (turn cap; ends on the persona's ending condition or time) and rubric scoring per criterion. Starter job-simulation tests for support, sales and operations roles join the starter library (YX-TB-13). Proctoring phase 2.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `test_versions` | Test, number, status (draft / in approval / published / archived), settings JSON, published_by / at, approval ref |
| `test_blueprints` + `blueprint_cells` | Section × skill × difficulty → count, marks; pool-depth check result |
| `test_question_marks` | Per-test override of marks / negative marks per question version |
| `adaptive_configs` | Start level, step rules, floor / ceiling, termination (count / time / SE threshold), engine (staircase / IRT, Q1) |
| `retake_policies` | Attempts allowed, cooldown, score rule, redraw flag, reset rights (Q5) |
| `irt_item_params` | Question version × model (Q2): a, b (c), SE, n responses, calibrated_at, status (provisional / calibrated) |
| `item_exposure` | Question version × window: times served, exposure rate, cap, status (Q7) |
| `attempt_scores` | raw, scaled, θ + SE, percentile(s), skill breakdown JSON, scoring version |
| `code_runs` | Every compile / run: code hash, language, result, timing (evidence, Q8) |
| `sql_datasets` | Seed schema + data per SQL question, engine, limits |
| `test_costs` | Cost per test taken (H1): test, `cost_basis` (tenant-entered amount per completed attempt / from the billing meter "test taken", D15), `amount`, `currency`, `valid_from`; set in the builder's **Scoring** step (§6 flow 1) (default: billing meter). Feeds `assessment.cost_per_test_taken` and the assessment cost rows in M10 `recruiting_costs` for cost per hire (P09 Q3; [APX-C](APX-C-reports-metrics.md) §2.5) |
| `starter_tests` + `starter_test_versions` | YukthiX starter tests per job-role profile (T01) × level: sections, blueprint, timing, cut-offs, suggested mode; platform catalogue (B4). Tenant copies become normal tests with `copied_from_starter_version` |
| `jd_assembly_runs` | Job / JD text ref, extracted skills (AI + confirmed), proposed blueprint, resulting draft test, gap cells, AI credits used, run by, status (B4) |
| `section_cutoffs` | Test version × section: cut-off basis (scaled / percent), value, shown to candidate before start (y/n) (B4) |
| `attempt_scores` (added fields) | `section_outcomes` JSON (section score vs cut-off, met y/n), `form_id`, `equating_run_id`, `equating_status` (provisional / equated) (B4, B15) |
| `test_forms` + `form_items` | Test version × form (A, B, C …), items, anchor flag per item (B15) |
| `equating_runs` | Test version, base form, method (Stocking–Lord), anchor set, linking constants per form, n per form, run_at, status (B15) |
| `cut_score_studies` | Test version, method (modified Angoff / bookmark), panel, rounds, recommended cut ± SE, impact data, approved cut, approval ref (P03), status (B15) |
| `cut_score_ratings` | Study × round × SME × item (Angoff probability) or bookmark position, comment (B15) |
| `section_settings` (T13) | Test version × section: kind (standard / in_tray / role_play), section time limit, turn cap, rubric ref, provisional-until-confirmed flag |

All tables carry `organization_id` + RLS, except the starter catalogue (`starter_tests`, `starter_test_versions`), which is platform catalogue (P07 YX-STAT-10).

## 5. Rules (YX-TB)

| ID | Rule |
|---|---|
| YX-TB-01 | A test can be published only when: every question version is approved (T01), section weights total 100 %, and every blueprint / adaptive cell meets the pool-depth minimum. |
| YX-TB-02 | Publishing creates an immutable test version. Editing a published test creates a new draft version. Candidates already invited keep their version unless an admin explicitly migrates them before they start (Q6). |
| YX-TB-03 | Randomised draws respect the blueprint exactly (count per skill × difficulty). Draws are seeded and stored on the attempt, so any attempt can be reproduced. |
| YX-TB-04 | Adaptive tests follow the Q1 engine. Step, floor / ceiling and termination rules are stored with the attempt. The adaptive path (item, answer, estimate after each item) is logged for review and appeals (T05). |
| YX-TB-05 | Adaptive, and any test where candidates see different forms, report a **scaled score** (Q3). Raw totals are never used to rank candidates across different forms. |
| YX-TB-06 | Enforced section timers auto-submit the section at zero. Advisory timers only warn. Forward-only sections never allow going back (Q4). |
| YX-TB-07 | Retakes follow the test's policy (Q5). A retake draws fresh questions where the pool allows. The score rule (best / latest / average) is shown to the candidate before starting. |
| YX-TB-08 | IRT parameters are used for scoring only once an item is **calibrated** (minimum responses per Q2). Provisional items are served as unscored pilot items or scored by authored difficulty, as configured. |
| YX-TB-09 | Item exposure is capped (Q7). Items over the cap are skipped by the draw and flagged for rotation. Adaptive selection includes exposure control. |
| YX-TB-10 | The coding sandbox enforces CPU, memory, wall-clock and **no network** per run. Every compile / run is kept as evidence (Q8). Hidden test cases never reach the browser. |
| YX-TB-11 | Test reliability (Cronbach's α for fixed / randomised; marginal reliability for IRT) is computed once the minimum number of attempts is reached. Tests below 0.7 are flagged to the owner. |
| YX-TB-12 | Every score records its scoring version (engine, parameters used). Re-scoring (e.g. after re-calibration or a T01 key fix) creates a new score version and never silently changes a released result (T05 release rules). |
| YX-TB-13 | **Starter tests (B4).** Starter tests are read-only and labelled "YukthiX starter"; tenants use them only through a **copy**, which becomes a normal draft test (YX-TB-01 / 02 apply). A newer starter version is shown as a prompt on the copy and is never applied automatically. Starter tests draw only from starter questions. |
| YX-TB-14 | **AI test assembly from a JD (B4).** Output is always a **draft** test, never published without human review. Only the JD text and the tenant's taxonomy / role-profile names go to AI (no candidate data, no answer keys, P10). Items are drawn only from **approved** questions; AI-drafted gap-fill questions start as drafts (T01 YX-QB-10). Each run is metered in AI credits (add-on, D18) and kept in `jd_assembly_runs`. |
| YX-TB-15 | **Sectional cut-offs (B4).** When a test has section cut-offs, the result is "pass" only if the overall pass mark **and** every enabled section cut-off are met. Each section's outcome is stored on the score. If the test says so, cut-offs are shown to the candidate before starting. A section voided by a T05 verdict counts as not met unless the reviewer records otherwise with a reason. |
| YX-TB-16 | **Parallel forms & equating (B15).** Parallel forms must share anchor items (default ≥ 20 %, minimum 10) and match the blueprint. Candidates on different forms are compared only on the **equated scaled score** (extends YX-TB-05). Scores before the Q2 minimum per form are marked "provisional"; re-equating creates a new score version (YX-TB-12). |
| YX-TB-17 | **Cut-score studies (B15).** A test marked **certification** can be published only with an approved cut-score study, or an owner override with a written reason (audited). SMEs rate independently in round 1 (no peer ratings visible). The study record (method, panel, rounds, ratings, impact data, approval) is kept with the test version. |
| YX-TB-18 | **Item fairness statistics (A13).** Item statistics include DIF (Mantel-Haenszel and IRT-based) per group once sample thresholds are met, and the question editor shows the DIF grade next to difficulty and discrimination. Findings follow T05 YX-EVAL-26 / 27. |
| YX-TB-19 | **Simulation sections (T13).** A section with simulation or role-play items has a section time limit (in-tray) or a turn cap plus time limit (role-play). Its score is the rubric total; when AI scored it and the test is used for hiring or promotion, the score is **provisional** until a human reviewer confirms or changes it (P10 YX-AI-01), and sectional cut-offs (YX-TB-15) use only the confirmed score. AI role-play runs consume AI credits (D18). |

## 6. Flows
1. **Build:**
   1. Pick a template or start blank.
   2. Sections.
   3. Blueprint (skill × difficulty grid with live pool-depth check), or pick fixed questions.
   4. Timing and navigation.
   5. Scoring.
   6. Retake policy.
   7. Proctoring mode (T04).
   8. Preview as a candidate.
   9. Submit for publish approval (Q6).
   10. Published version.
2. **Calibrate** (nightly job):
   1. Collect responses per item.
   2. Once the minimum is reached, fit the IRT parameters (Q2).
   3. Mark the item calibrated.
   4. Recompute test reliability and exposure.
   5. Notify owners of weak items (low discrimination, distractor issues, over-exposure).
3. **Adaptive attempt:**
   1. Start at the configured level.
   2. After each answer, update the estimate.
   3. Select the next item (level / information, excluding exposed items).
   4. Stop per the termination rule.
   5. Scaled score.
4. **Build from a JD (B4):** JD → confirm skills → proposed blueprint → draft test with gap cells → fill gaps (optional AI drafts) → continue at flow 1 step 4.
5. **Cut-score study (B15):** owner starts a study → invites SMEs (P03 tasks) → round 1 independent ratings → impact data and discussion → round 2 → recommended cut ± SE → owner approves (P03) → cut applied to the test version.
6. **Equating (B15, nightly with calibration):** per test with parallel forms, once anchors are calibrated → link each form to the base form → update form scaled scores (new score version) → notify the owner if an anchor drifts.

## 7. UI
- **Test builder** (stepper in the T4 template), with a **blueprint grid**: cells show `needed / available`, and turn red when below pool depth.
- **Adaptive config panel**, with a simulation: "100 simulated candidates → average items used, SE, exposure".
- **Item analysis dashboard:** per item p / r / IRT curves / distractors / exposure. Per test: α, distribution, section correlation.
- **Candidate score report:** scaled score, band, percentile, skill bars, visibility per T05.
- **Template library (B4):** "YukthiX starter" and "Our templates" tabs, filter by role / level; **Build from JD** entry point in the builder.
- **Standard-setting workspace (B15):** SME rating grid per item (Angoff) or ordered item booklet (bookmark), round status, impact chart.

## 8. Migration & rollout
Existing tests become **version 1, published**. Existing attempts keep raw scores, and their scaled score = raw % for fixed tests.

Build order:
1. Versions and approval.
2. Blueprint and pool depth.
3. Timing, navigation and retakes.
4. Coding / SQL hardening.
5. Staircase adaptive.
6. IRT calibration and CAT.
7. Exposure control.
8. Reliability.
9. **Proctoring track, phase 2:** sectional cut-offs → starter test library → JD assembly (B4); parallel forms + equating → cut-score studies (B15).

## 9. Acceptance tests (samples)
- A blueprint needing 5 hard Java items with only 8 approved blocks publishing (k = 3× → 15 needed) (YX-TB-01).
- Editing a published test: candidates already invited still get v1 (YX-TB-02).
- Two adaptive candidates who both answer correctly at their level but see different items get comparable scaled scores; ranking uses the scaled score (YX-TB-05).
- An enforced 20-minute section auto-submits at 20:00, and the candidate moves to the next section (YX-TB-06).
- An item served to 40 % of a drive with a 30 % cap stops being drawn and is flagged (YX-TB-09).
- A coding submission that tries to open a network socket fails in the sandbox, and the run is kept in the history (YX-TB-10).
- A tenant copies the starter "Data Analyst · L1" test; the copy is a draft they can edit and publish, while the starter test stays read-only (YX-TB-13).
- Build from a JD for "Senior React Developer" produces a draft test with confirmed skills; a cell with too few approved items shows a gap and blocks publishing until filled (YX-TB-14, YX-TB-01).
- Overall pass mark 60 %, Aptitude section cut-off 50 %: a candidate at 72 % overall with 45 % in Aptitude is "not passed", and the section outcome shows why (YX-TB-15).
- Two candidates on forms A and B with the same equated scaled score rank equally, even though form B's raw total is 4 marks lower (YX-TB-16).
- A test marked certification can't be published without an approved cut-score study or an owner override with a reason (YX-TB-17).
- T13: a support-role test with an in-tray and a role-play section shows the role-play score as provisional until a reviewer confirms it; the sectional cut-off is applied only after confirmation (YX-TB-19).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Adaptive engine | **Two stages:** launch with a **rule-based staircase** (step up / down on authored difficulty, spec rules) usable immediately; switch a test to **IRT-based CAT** (select by information, stop at SE threshold) once its pool is calibrated. |
| Q2 | IRT model & calibration | **2-parameter logistic (2PL)** per item (difficulty + discrimination); **minimum 200 responses** before an item is calibrated; nightly calibration per tenant pool; 3PL (guessing) later if data supports it; library-pack items (T01 Q7) may ship pre-calibrated. |
| Q3 | Comparable score shown to candidates / recruiters | **Scaled score 0–100** with bands (e.g. below / meets / strong), **percentile** vs cohort, and **skill breakdown**; raw score visible to admins; θ ± SE in the admin report for adaptive tests. |
| Q4 | Sectional timing & navigation | **Per section:** timer advisory (default) or enforced (auto-submit), navigation free (default) or forward-only; mark-for-review only in free sections. |
| Q5 | Retake policy | **Per test:** attempts allowed (default 1 for hiring, 3 for training), cooldown days, score rule (best / latest / average; default latest for hiring, best for training), fresh draw on retake; admin can grant an extra attempt with a reason (audited). |
| Q6 | Test versions & publish approval | **Versioned tests**; publish approval **configurable per test**: default self-publish with a pre-publish checklist; **mandatory approver for tests marked high-stakes** (certification, drives above N candidates). |
| Q7 | Question exposure control | **Cap per item** (default **30 %** of candidates in a rolling 30-day window, per test / drive configurable), skip over-exposed items, rotation alerts to owners; adaptive uses exposure-controlled selection. |
| Q8 | Coding & SQL | **Explicit sandbox limits** (default 2 s CPU, 256 MB, 10 s wall, no network), **SQL questions** on an isolated per-run PostgreSQL / SQLite dataset with result-set comparison, **editor policy per question** (autocomplete off / basic / full; theme choice), **full run history kept** as evidence (T05). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Two-stage adaptive engine:** launch with a **rule-based staircase** on authored difficulty (start level, step up / down, floor / ceiling, consecutive-answer rules, termination by count or time); a test switches to **IRT-based CAT** (max-information selection with exposure control, stop at SE threshold) once its pool is calibrated (YX-TB-08). | 25 Sep 2026 |
| Q2 | **2PL IRT** (difficulty + discrimination) per question version; **minimum 200 responses** before calibrated; nightly calibration per tenant pool; 3PL later if data supports it; partner library packs may ship pre-calibrated (linked to the tenant scale via anchor items). | 25 Sep 2026 |
| Q3 | **Scaled score 0–100** with configurable bands (default below / meets / strong), **percentile** vs cohort (drive / job / all takers), **skill breakdown**; raw marks visible to admins; θ ± SE in the admin report for adaptive tests; candidate visibility follows T05 release settings. | 25 Sep 2026 |
| Q4 | **Per section:** timer advisory (default, warns) or enforced (auto-submit at zero, YX-TB-06); navigation free (default, with mark-for-review) or forward-only; adaptive sections are always forward-only. | 25 Sep 2026 |
| Q5 | **Retake policy per test:** attempts allowed (default 1 hiring / 3 training), cooldown days, score rule (default latest for hiring, best for training; average optional), fresh draw on retake where the pool allows; admin can grant an extra attempt with a reason (audited); technical-failure resets are handled in T03 session continuity, not counted as retakes. | 25 Sep 2026 |
| Q6 | **Versioned tests; self-publish** after the automatic pre-publish checklist (YX-TB-01) by default; **mandatory approver (P03) for tests marked high-stakes** (certification, or drives above a company-set candidate count, default 500). | 25 Sep 2026 |
| Q7 | **Exposure cap per item: default 30 %** of a test's candidates in a rolling 30-day window (configurable per test / drive); over-exposed items skipped by draws and flagged; rotation alerts to owners; adaptive selection is exposure-controlled (YX-TB-09); leak monitoring in T05. | 25 Sep 2026 |
| Q8 | **Coding & SQL hardening:** explicit sandbox limits (default 2 s CPU, 256 MB, 10 s wall, no network; per-question override within platform maximums); **SQL questions** on an isolated per-run dataset (PostgreSQL / SQLite) with result-set comparison; **editor policy per question** (autocomplete off / basic / full, theme); **full compile / run history kept** as integrity evidence (T05). Multi-file IDE projects not in scope. | 25 Sep 2026 |
| H1 (consistency fix) | **Cost per test taken (GAP-REGISTER H1):** `test_costs` per test (§4), either tenant-entered per completed attempt or taken from the billing meter (D15 "test taken"), dated; feeds `assessment.cost_per_test_taken` and the assessment line of M10 `recruiting_costs`, so P09 Q3 cost per hire is deliverable ([APX-C](APX-C-reports-metrics.md)). | 26 Sep 2026 |
| B4 | **Gap-register extension (user decision 26 Sep 2026): ready-made tests, JD assembly, sectional cut-offs.** (1) **Starter test library** per job role × level, built from the starter questions and T01 role profiles, read-only, tenants copy & edit (labelled starter template, D17; YX-TB-13). (2) **AI test assembly from a JD:** JD → skills → blueprint → draft test from approved items, gap cells can request AI question drafts, mandatory human review, AI credits metered (YX-TB-14). (3) **Sectional cut-offs** in addition to the overall pass mark; pass only when all are met (YX-TB-15). Starter tests and cut-offs included in the Proctoring price; AI runs use AI credits (add-on, D18). Proctoring track, phase 2. | 26 Sep 2026 |
| B15 | **Gap-register extension (user decision 26 Sep 2026): certification depth (T02 part).** (1) **Parallel fixed forms** sharing anchor items (default ≥ 20 %, min 10), **IRT linking** (Stocking–Lord on 2PL anchors) to a base form, **form-level equated scaled scores**, provisional until the Q2 minimum per form (YX-TB-16). (2) **Cut-score studies** for certification tests — modified Angoff or bookmark with an SME panel, rounds with impact data, owner approval via P03; certification tests need an approved study or an audited override (YX-TB-17; starter policy: Angoff, 5 SMEs, 2 rounds, D17). Badges and LTI are in T05. Included in the price (D18). Proctoring track, phase 2. | 26 Sep 2026 |
| T13 | **Validation pass 3 Should (T13), founder decision 28 Sep 2026:** simulation and AI role-play **sections** (in-tray time limit, role-play turn cap, rubric scores provisional until a human confirms for hiring / promotion, AI credits) and **starter job-simulation tests** for support, sales and operations (YX-TB-19; items in T01 YX-QB-17). Proctoring phase 2. | 28 Sep 2026 |
