# T05 · Integrity, Evaluation & Outcomes

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026** with GAP-REGISTER **B5** (session report PDF), **B6** (ATS connectors, assessment webhooks), **B14** (CEFR and typing scoring), **A13** (fairness & validity analytics), **B15** (digital badges, LTI 1.3 tool) and **C5** (AI-allowed mode scoring) — see §3 "Gap-register extensions" and §11. Fairness / validity analytics (A13) are designed separately. **Corrected 28 Sep 2026** (validation pass 3, C4): A13 fairness analytics and oversight extended to employee-side AI for EU tenants (YX-EVAL-29). **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** identity chain across hiring and deepfake partner check (YX-EVAL-30; §11 T10).
> **Covers:** spec §1.1.9 (retention, data residency, chain of custody), §1.1.10 Integrity Checks, §1.1.11 Incident Management, §1.1.12 (manual evaluation and outputs), §1.1.15 Privacy, Consent & Fairness, §1.1.16 Integrations; [reuse inventory](../reference/exam-app-reuse-inventory.md) for the same sections.
> **Builds on:** T02 (scores, re-scoring), T04 (signals, recordings), P02 (Special data), P08 (append-only audit + hash chain, legal hold pattern), P10 (AI tiers), M07 (learning / certificates), M10 (ATS pipeline, retention Q6).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
Turn signals and answers into **defensible decisions**:
- Incidents are reviewed with evidence and can be appealed.
- Answers that need a person are marked consistently.
- Results flow to hiring and learning.
- Candidates' biometric data is handled lawfully and deleted on time.

## 2. What exists today (exam app) — keep / change / add

| Capability | Today | T05 |
|---|---|---|
| Violation taxonomy with severity | Done | **Keep** |
| Code similarity | 5-gram Jaccard across attempts | **Keep**. **Add** MCQ / text collusion and external plagiarism (Q3) |
| Incidents | Events, snapshots and captures; no incident object; grading queue and integrity panel | **Add** incidents, evidence bundles, verdicts (Q1) |
| Override with reason | Proctoring bypass reason only | **Generalise** to every verdict and score change |
| Appeal | Missing | **Add** (Q2) |
| Tamper-evident audit | Append-only audit logs | **Add** a hash chain (P08) + evidence hashes |
| Manual grading | Feedback + model answer; AI code review | **Add** rubrics, multiple / blind evaluators, agreement checks (Q4) |
| Release / visibility, cohort compare, percentile | Done | **Keep**. Holds while an incident is open (Q5) |
| ATS link | Exams on jobs; `exam_passed` gate | **Add** auto-advance rules (Q6) |
| Certificates | Templates, PDF, verify page (tied to attempts) | **Link** to M07 learning records and P05 documents |
| LMS (SCORM / xAPI) | Missing | Covered by M07 (SCORM player, xAPI wave 6); an LTI 1.3 tool for external LMSs is noted for later |
| Retention | Nightly 90-day sweeps, hard-coded | **Make** configurable per tenant (default **30 days**, G17), with legal hold (Q7) |
| Consent | Granular biometric + attempt consent | **Add** jurisdiction-specific consent and lawful basis (Q8) |
| Fairness | Manual fallback; no auto-fail on biometrics | **Keep**. **Add** published accuracy testing (Q8) |

## 3. Concepts
- **Incident:** one or more related signals (T04) in an attempt, grouped by time and type. It has:
  - severity;
  - an **evidence bundle**: clips, stills, logs, timeline, hashes;
  - status: open → under review → verdict → (appeal) → closed.
- **Verdict:** a reviewer's decision:

  | Verdict | Effect |
  |---|---|
  | **Cleared** | No integrity action |
  | **Warning noted** | Recorded; the score stands |
  | **Section invalidated** | That section's score is voided |
  | **Attempt invalidated** | The whole attempt is voided |

  Each verdict carries a reason and the evidence references (Q1).
- **Appeal:** the candidate's request to reconsider a verdict or score, reviewed by a different reviewer (Q2).
- **Rubric:** criteria × levels × points for descriptive, video, file and essay answers. **Evaluation:** one evaluator's scoring of one response. **Moderation:** reconciling evaluators who disagree (Q4).
- **Outcome:** what leaves the assessment:
  - a result released to the candidate (Q5);
  - an ATS pipeline action (Q6);
  - a learning completion or certificate (M07);
  - a competency evidence update (T01 Q2 mapping).
- **Reviewer assignment (G7):** incidents are assigned to a reviewer from the tenant's **reviewer pool** by a company-configurable **assignment policy** (starter template: round-robin, D17):
  - **round-robin** among eligible, available reviewers;
  - **by language:** only reviewers whose languages include the attempt's language (T01 Q5), then round-robin;
  - **by load:** the eligible reviewer with the fewest open items, weighted by severity.

  Each reviewer may have a **capacity cap** (maximum open items); reviewers at the cap, on leave (M02) or delegating (P03) are skipped. A test may override the tenant policy. **Conflict of interest:** a reviewer is never the candidate's recruiter, hiring manager or interviewer / panel member on the application the attempt belongs to (M10); for an employee test-taker (T03 `test_takers`), never in the employee's manager chain; never the test-taker. Appeals (YX-EVAL-04) and second reviews for invalidation (YX-EVAL-01) also exclude the first reviewer. The same policy assigns appeals and, when the test enables it, manual-evaluation queues (Q4). Rule YX-EVAL-15.
- **Evidence chain of custody:** every recording, clip and bundle is hashed at creation. Hashes go into the P08 hash chain, and access to evidence is audited.

### Gap-register extensions (26 Sep 2026; Proctoring track, phase 2)
- **Session report PDF (B5):** an auto-generated, one-per-attempt report for hiring managers, institutions and ATS users: candidate and test, identity result (method, match result — no ID image), **timeline** of the session with flag markers, **key stills** (count set by the company, default 6, face-blur option), flags with the **integrity score and its weights** (T04 YX-PROC-14), incidents with **verdict**, reviewer and date. Generated when the integrity review closes (or on demand, watermarked "provisional — review open"). Stored as a P05 document (APX-F #97), watermarked per viewer, shared by expiring link.
- **ATS connectors for standalone Proctoring (B6):** standard connectors for **Greenhouse, Lever, Workday, SAP SuccessFactors, SmartRecruiters and iCIMS** (each ATS's assessment-partner integration pattern):
  1. the company connects its ATS account (OAuth / API key, P10 B3 pattern) and maps ATS jobs / stages to YukthiX tests;
  2. moving a candidate into the mapped stage (or "send assessment" in the ATS) creates a YukthiX invitation with minimal candidate data (name, email, phone, ATS ids);
  3. status (invited / started / completed / under review) and, once released, **results** (the elements the company allows: status, scaled score, band, sectional outcomes, integrity status) and a **report link** (session report / score report) go back to the ATS candidate record.

  Standard connectors are **included** in the Proctoring price; a **custom connection** for another ATS is paid customisation (D18). Inside the YukthiX suite, M10 is used directly (Q6).
- **Assessment webhooks (B6):** the assessment events in APX-B (`test.invitation.created`, `attempt.submitted`, `result.released`, `result.held`, `incident.verdict`, `appeal.decided`, and `session_report.ready`) are available as P11 webhooks: signed (HMAC), retried with backoff, thin payloads with ids and a fetch link, subject to P02 field classes.
- **Language proficiency scoring (B14):** speaking and writing responses (T01 YX-QB-14) get an **AI-suggested score on a CEFR-aligned rubric** — writing: task achievement, coherence, range, accuracy; speaking: fluency, coherence, range, accuracy (from the transcript) and pronunciation (from in-region, in-house acoustic features; audio never leaves the region). The output is a CEFR level (A1–C2) per criterion and overall. It is **advisory** (YX-EVAL-06): evaluators confirm it (batch confirmation allowed for tests not marked high-stakes), and **high-stakes tests need an individual human rating** (plus a second blind rater per Q4 when configured).
- **Typing scoring (B14):** deterministic — **net WPM** = (characters typed ÷ 5 − uncorrected errors) ÷ minutes, **accuracy %**, error count; pass thresholds set by the company per test (starter template: 30 net WPM, 90 % accuracy; D17). Pasted or injected text and unnaturally uniform keystroke intervals raise an integrity flag.
- **Digital badges (B15):** a certificate (Q6, P05) can also be issued as an **Open Badges 3.0** verifiable credential (signed with the tenant's issuer profile; achievement, criteria, evidence link, expiry) and / or pushed to **Credly** through the company's own Credly account (Credly's fees are the company's third-party cost, D18).
- **LTI 1.3 tool (B15):** YukthiX is an **LTI 1.3 / LTI Advantage tool**, so external LMSs (Moodle, Canvas, Blackboard, D2L, Cornerstone …) can launch assessments: platform registration (issuer, client id, deployment, JWKS), **Deep Linking** to pick a test, **Assignment & Grade Services** to return the released score, optional **Names & Roles**. An LTI learner becomes a test-taker linked to the LMS platform + user id. Supersedes "LTI 1.3 later" in §2 / Q6. (M07 remains the in-suite LMS; this is for customers' external LMSs.)
- **AI-allowed mode scoring (C5):** for tests in AI-allowed mode (T04 YX-PROC-16), the rubric may include criteria for **prompting quality**, **verification of AI output** (checking, testing, correcting) and **final answer correctness**. Evaluators see the assistant log next to each response; an AI-suggested score may assist (advisory, YX-EVAL-06).
- **Fairness & validity analytics (A13):** for every test and question used in hiring, YukthiX measures whether it treats groups fairly and whether it predicts job success.
  - **Group data:** optional, **self-declared** gender, age band, disability, and region / language (plus caste category or other attributes only where the company enables them and local law allows). Collected in a separate form after submission, stored **Special**, never shown to evaluators or in the candidate's record, and used only in aggregate.
  - **Adverse impact:** pass / shortlist rate per group vs the highest-rate group (**4/5ths rule**), plus a statistical test (Fisher / z-test) so small samples don't cause false alarms; per test, section, cut score and ATS stage.
  - **Differential item functioning (DIF):** per question, Mantel-Haenszel and IRT-based DIF (T02 item statistics), graded A / B / C (negligible / moderate / large).
  - **Predictive validity:** for suite customers (Proctoring + HRMS), test scores of hires are correlated with later **M06 performance ratings**, time-to-productivity and **retention at 6 / 12 months**, per test and job family; shown with sample size and confidence interval (Q10).
  - **Cross-tenant norms:** reuse the T06 Q4 opt-in pooled norms (k-anonymity) for benchmark comparisons.
  - **Employee-side AI (EU tenants, C4):** the EU AI Act Annex III(4) also covers AI for promotion / termination, task allocation and monitoring / evaluating workers (P10 §A4). For EU tenants the same analytics and oversight therefore also cover the employee-side AI features classed high-risk or "depends" there: **attrition-risk band** (M06 YX-PERF-17), **AI in performance reviews**, **M12 task-allocation suggestions**, **individual M02 attendance anomaly flags** and **psychometric scores used for promotion** (T06). Outcome rates per group (e.g. share banded high-risk, share flagged, share suggested for assignments) get the same 4/5ths + significance test and minimum group sizes (P09 suppression); group data comes from the same optional, self-declared, Special `demographic_declarations` (employee variant: never shown to managers or on any decision screen); findings follow the Q9 response (alert + required review, or auto-suspend the feature for that tenant through the P10 kill switch); a named reviewer provides human oversight; results appear on the tenant's P10 model card. Companies outside the EU may switch this on.
  - **Response to findings (Q9, D17):** each company chooses per test **alert + required review** (starter template) or **auto-suspend** the question / test from new attempts until a reviewer clears it. Every finding creates a review task with the evidence; the decision (keep with justification / revise / retire) is audited.
- **Dispute after final appeal (J23).** When a candidate or employee takes an upheld verdict further (legal notice, court or tribunal case, or a complaint to the Data Protection Board), the incident moves to an **escalated** state: a legal hold covers all its evidence, and an admin can produce a **court-ready evidence export** with an electronic-records certificate.
- **NYC bias audit support (R13).** For employers using AI-scored hiring tools for New York City jobs (Local Law 144), YukthiX provides a yearly **bias-audit export** built on the A13 fairness analytics and scoped read-only access for the employer's **independent auditor**.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `incidents` | Attempt, type(s), severity, window, status, assigned reviewer, SLA due |
| `incident_evidence` | Incident × evidence ref (recording segment / clip / still / log), hash |
| `incident_verdicts` | Verdict, reason, reviewer(s), second-review flag, decided_at |
| `appeals` | Attempt / incident / score, candidate statement, attachments, status, reviewer, decision, decided_at |
| `rubrics` + `rubric_criteria` + `rubric_levels` | Per question version or per test |
| `evaluations` | Response × evaluator × rubric scores, comments, blind flag, AI-suggested score (advisory) |
| `moderations` | Response, evaluator disagreement, third-evaluator result, final score |
| `integrity_checks` | Attempt × check (code similarity, answer-pattern collusion, text plagiarism, leak match), score, matched attempts / sources |
| `question_leak_alerts` | Question version, source (web / channel), match evidence, action (retire / rotate) |
| `retention_policies` | Tenant × data class (recordings, biometrics, ID images, answers, scores), days, legal-hold overrides |
| `consent_records` | Candidate × attempt × purpose (biometric, recording, AI processing), jurisdiction, text version, granted / declined, withdrawn_at; for an under-18 candidate, the guardian who consented and how it was verified (E16) |
| `identity_verifications` | Attempt × method (government ID / admit card + institution-attested photo / proctor manual check), verifier, evidence ref, result (E16) |
| `fairness_reports` | Model version, dataset, metrics per demographic group, published_at |
| `review_assignment_policies` | Tenant (or test override) × queue (incidents / appeals / evaluation): mode (round-robin / by language / by load), COI checks on, SLA, version (G7) |
| `reviewer_pool_members` | Reviewer (user), languages, capacity cap, active, round-robin cursor, last assigned_at (G7) |
| `review_assignments` | Incident / appeal / response × reviewer, assigned_by (policy / manual), assigned_at, reassigned_from, COI check result, reason for manual reassignment (G7) |
| `session_reports` | Attempt, P05 document ref, version, status (provisional / final), stills included, generated_at, share links (expiry, viewer), superseded_by (B5) |
| `ats_connections` + `ats_test_mappings` | Tenant × ATS (Greenhouse / Lever / Workday / SAP SF / SmartRecruiters / iCIMS / custom), auth ref (vault), status; ATS job / stage → test, result elements sent (B6) |
| `ats_assessment_links` | Invitation × ATS candidate / application ids, last status pushed, last push result, retries (B6) |
| `language_scores` | Response × CEFR level per criterion and overall, AI-suggested vs confirmed, model version, confirmed_by (B14) |
| `typing_results` | Response × gross / net WPM, accuracy %, uncorrected errors, duration (B14) |
| `badge_issuances` | Certificate × format (Open Badges 3.0 / Credly), credential id, issued_at, expires_at, revoked_at, reason (B15) |
| `lti_platforms` + `lti_deployments` + `lti_launches` | Issuer, client id, JWKS, deployment; resource link → test; launch × LMS user → test-taker / attempt; grade passback status (B15) |
| `demographic_declarations` | Test-taker **or employee (employee-side AI, C4)** × attribute (self-declared), value or "prefer not to say", collected_at, consent ref; **Special**, isolated from evaluation (A13) |
| `fairness_analyses` | Test / section / question version / cut score **or employee-side AI feature (C4)** × group × period: sample sizes, selection rates, impact ratio, significance, DIF statistic and grade, status (ok / watch / flagged) (A13) |
| `validity_studies` (shared with T06) | Test × job family × criterion (M06 rating / retention / time-to-productivity), n, correlation, confidence interval, period (A13) |
| `fairness_findings` | Analysis × response mode (alert / auto-suspend), review task, decision (keep + justification / revise / retire), decided_by, decided_at (A13) |
| `dispute_escalations` (J23) | Incident / appeal ref, type (legal_notice / court / dpb_complaint), external reference, raised on, counsel, legal hold ref, status, closed on + reason |
| `evidence_exports` (J23) | Escalation ref, file list, SHA-256 manifest + hash, audit-trail proof (P08), certificate document (P05), signatory, generated by / at |
| `bias_audits` (R13) | AI feature, data period, export ref, auditor name / firm, audit date, published summary URL, next due |

All tables carry `organization_id` + RLS, except `fairness_reports`, which is a platform catalogue. Evidence, biometrics and appeal attachments are **Special**.

## 5. Rules (YX-EVAL)

| ID | Rule |
|---|---|
| YX-EVAL-01 | Only a human verdict can invalidate a section or an attempt. **Attempt invalidation needs two reviewers**, or one reviewer plus the test owner (Q1). Signals and AI never decide. |
| YX-EVAL-02 | Every verdict, score override and re-score records a reason, the evidence referenced and the actor. It is appended to the hash-chained audit (P08). |
| YX-EVAL-03 | Results affected by an open incident or appeal are **held**. They are not released, and no ATS / learning action happens, until closed (Q5, Q6). |
| YX-EVAL-04 | A candidate may appeal within the appeal window (Q2). The appeal is decided by a reviewer who didn't make the original decision. The decision and reason are sent to the candidate. |
| YX-EVAL-05 | Rubric-marked responses: with multiple evaluators, each marks blind (no other scores, no candidate identity if blind mode is on). A difference above the threshold triggers a moderation / third evaluator (Q4). |
| YX-EVAL-06 | AI-suggested scores are advisory, shown only after the evaluator enters their own (or, if configured, shown as a suggestion). They're never final without human confirmation (P10 YX-AI-01). |
| YX-EVAL-07 | Collusion and plagiarism results are integrity flags feeding incidents. They never change a score by themselves. |
| YX-EVAL-08 | Retention: data classes are deleted automatically at the end of their retention (Q7) unless under **legal hold** (open incident / appeal / litigation). Each deletion writes a deletion record. The shipped default for proctoring evidence (recordings / clips / face data / ID images) is **30 days** (Q7 as amended by G17); the company sets **30–365**. |
| YX-EVAL-09 | No biometric capture (face, voice, ID image) without explicit, purpose-specific consent recorded for the candidate's jurisdiction (Q8). A candidate who declines gets the fallback path the test allows (manual ID check or an unproctored alternative), or is told clearly that the test can't proceed. |
| YX-EVAL-10 | Candidates may withdraw consent and request erasure. Erasure removes biometrics and recordings, keeps a minimal, non-identifying score record where the law allows, and is completed within the legal limit. |
| YX-EVAL-11 | A failed face detection never fails a candidate. It routes to manual review (existing behaviour, kept). |
| YX-EVAL-12 | Auto-advance into the ATS only happens when score rules are met **and** the integrity status is clear or cleared. A candidate is never auto-rejected on integrity grounds (Q6). |
| YX-EVAL-13 | **Minors (law; DPDP s.9; E16).** An under-18 test-taker (date of birth from M10 YX-ATS-19 or the test invite) needs **verifiable guardian consent** before any biometric capture (face, voice, ID image). Their answers get deterministic scoring only: **no AI-assisted / LLM scoring** or AI-suggested scores beyond deterministic scoring, and **no profiling** (behavioural analytics, cross-attempt ranking beyond the test's own result). Human rubric marking is allowed. This is a legal rule and can't be switched off. |
| YX-EVAL-14 | **Candidate without a government ID (E16).** Where the test allows it, a candidate can verify identity by an alternate path: an **admit card plus a photo attested by their institution**, or a **proctor's manual verification** (live check against submitted details). The method is recorded on the attempt; a test that requires government ID says so before the candidate starts. |
| YX-EVAL-15 | **Reviewer assignment and conflict of interest (G7).** Incidents (and appeals, and manual-evaluation queues where the test enables it) are assigned by the tenant's assignment policy — **round-robin** (starter template, D17), **by language** or **by load** — optionally overridden per test, skipping reviewers who are at their capacity cap, on leave or delegating. A reviewer may never be assigned an item where they are the candidate's **recruiter, hiring manager or interviewer / panel member** on that application, in an employee test-taker's **manager chain**, or the test-taker; appeals and second reviews also exclude the first reviewer (YX-EVAL-01 / 04). The conflict check runs on every assignment and manual reassignment and cannot be overridden; an item with no eligible reviewer escalates to the pool owner (test owner / proctoring admin) to add a reviewer. Assignments, reassignments and COI results are audited (P08). |
| YX-EVAL-16 | **Session report PDF (B5).** One report per attempt; a verdict or appeal that changes the outcome generates a new version and supersedes the old one. It never contains ID images, full recordings or accommodation details; stills are omitted when recording consent was withdrawn or for an under-18 test-taker without guardian consent. A report is "final" only after the integrity review closes; earlier copies are watermarked "provisional". Access follows P02 (Confidential); every external share uses an expiring link and is audited. |
| YX-EVAL-17 | **ATS connectors (B6).** Results go to an external ATS only when **released** (YX-EVAL-03) and only the elements the company chose for that mapping; a held result pushes only "under review". The ATS never receives evidence, answers or biometric data — only a report link that enforces YukthiX access rules. Push failures are retried and shown to the admin; nothing is silently dropped. YukthiX never sends a reject decision: it sends results, and decisions stay with the company in its ATS (YX-EVAL-12 spirit). |
| YX-EVAL-18 | **Assessment webhooks (B6).** Assessment webhooks are signed, retried and carry thin payloads (ids + fetch link); fetching applies P02 field classes and the release state, so a subscriber can't read a held result early. |
| YX-EVAL-19 | **Language proficiency scoring (B14).** CEFR AI scores are **advisory** and need human confirmation before release (YX-EVAL-06); high-stakes tests need an individual human rating. Only transcripts / text go to external AI; pronunciation features are computed in-region from audio (P10, M10 R1). Under-18 test-takers are human-rated only (YX-EVAL-13). The report shows "AI-assisted, human-confirmed" and the confirming evaluator. |
| YX-EVAL-20 | **Typing scoring (B14).** Typing results are computed deterministically from the server-side keystroke log using the published formula; pasted or programmatic input is not counted and raises an integrity flag (never a score change by itself, YX-EVAL-07). |
| YX-EVAL-21 | **Digital badges (B15).** A badge is issued only for a released pass on a certificate-enabled test and carries the certificate's verification link. Section / attempt invalidation or an appeal that removes the pass **revokes** it (Open Badges status list / Credly revoke) within 24 hours, with a reason. |
| YX-EVAL-22 | **LTI 1.3 (B15).** Launches are accepted only from registered platforms with valid signed ID tokens (nonce, audience, deployment checks). Grades are passed back only after release (YX-EVAL-03), as the scaled score unless the company chooses otherwise. LTI test-takers get the same consent, integrity and appeal rights as any candidate. |
| YX-EVAL-23 | **AI-allowed mode evaluation (C5).** Evaluators of AI-allowed tests see the full assistant log for each response; prompting / verification criteria are scored only from that log and the answer. Use of the approved assistant is never an integrity issue in that test. |
| YX-EVAL-24 | **Fairness data (A13).** Demographic data is optional and self-declared, collected separately after submission, stored as Special data, and never visible to evaluators, reviewers, ATS stages or the candidate record. It is used only in aggregate fairness analyses. |
| YX-EVAL-25 | **Adverse impact (A13).** Impact ratios (4/5ths rule) and significance are computed per test, section, cut score and ATS stage whenever a group has enough data (minimum group size, P09 suppression). A ratio below 0.8 with significance raises a finding. |
| YX-EVAL-26 | **Item bias (A13).** DIF is computed per question version once sample thresholds are met; a grade C (large) DIF raises a finding on that question. |
| YX-EVAL-27 | **Finding response (A13, Q9).** Each company chooses per test between alert + required review (starter template) and auto-suspend from new attempts until cleared. Attempts in progress are never interrupted. Every decision is audited with its justification. |
| YX-EVAL-28 | **Predictive validity (A13, Q10).** For tenants using Proctoring and HRMS, hires' scores are linked to M06 ratings, time-to-productivity and retention and reported only in aggregate with minimum sample sizes; the purpose is stated in the candidate and employee privacy notices. Individual-level linked data is never shown. |
| YX-EVAL-29 | **Employee-side AI fairness (C4).** For EU tenants, A13 fairness analytics and human oversight also cover every employee-side AI feature classed high-risk or "depends" under EU AI Act Annex III(4) in P10 §A4 (attrition risk, AI in performance reviews, M12 allocation suggestions, individual M02 anomaly flags, psychometric scores used for promotion): adverse impact of outcomes per group (YX-EVAL-25 method, minimum group sizes), optional self-declared Special group data never shown on decision screens (YX-EVAL-24), findings handled per YX-EVAL-27 including suspension through the P10 kill switch, and results on the P10 model card. |
| YX-EVAL-30 | **Identity-mismatch and deepfake signals (T10).** `identity.mismatch` (T04 YX-PROC-19) and `media.synthetic_suspected` / `voice.clone_suspected` (T04 YX-PROC-20) open or join an **incident** like any other flag, are assigned under YX-EVAL-15 (the interviewer who attested is never the reviewer), and follow YX-EVAL-01 / 03 / 04: only a human verdict acts, results or the application stage are held while open, and the candidate may **explain, re-verify and appeal**. The evidence (match score, stills, partner result, attestation) is Special and kept per YX-EVAL-08 (30-day default, legal hold while open); identity templates are erased on consent withdrawal (YX-EVAL-09). |
| YX-EVAL-31 | **Escalated disputes (J23).** Only after the final appeal verdict, a tenant admin or legal role records an escalation (legal notice / court / DPB complaint, reference, date, counsel). This places a **legal hold** (YX-EVAL-08, P08 pattern) on every evidence item, score, report and audit record of the incident; retention sweeps and erasure requests skip them (the requester is told why) until a recorded closure. The **evidence export** is a sealed package: files, the P08 audit trail with hash-chain proof, a SHA-256 manifest and an **electronic-records certificate** from an APX-F template for the tenant's signatory (India: **Bharatiya Sakshya Adhiniyam 2023 s. 63** certificate, which replaced Evidence Act s. 65B; section and Schedule Part A / B format **to be verified with counsel** before release). Every export is audited and watermarked with the case reference. |
| YX-EVAL-32 | **NYC LL144 bias audit (R13).** With the company's NYC setting on, each AI-scored hiring feature used for NYC jobs (AI interview, candidate-fit, AI first round, AI-scored tests) produces a yearly **bias-audit export** from A13 data (YX-EVAL-25 method): selection or scoring rates and **impact ratios** by sex, race / ethnicity and intersectional categories, counts per category, small categories flagged for the auditor, and the data period, with no candidate identities. The **independent auditor** gets time-boxed read-only access to the export and the P10 model card. The company records the audit date and publishes the summary URL; a feature whose last audit is more than a year old is blocked for NYC jobs until a new audit is recorded. Candidate notice and the alternative process are in M10. |

## 6. Flows
1. **Integrity review:**
   1. The attempt ends.
   2. Signals are grouped into incidents.
   3. Integrity checks run: code, answer patterns, text.
   4. Items go to the review queue, sorted by severity, and are assigned to an eligible reviewer by the assignment policy (conflict-of-interest check, capacity cap; YX-EVAL-15).
   5. The reviewer plays the evidence at flagged moments and gives a verdict.
   6. Invalidation needs a second review.
   7. Results are released, or held until the case closes.
2. **Appeal:**
   1. The candidate sees the verdict or result.
   2. They appeal within the window, with a statement and evidence.
   3. A different reviewer checks it.
   4. The decision is final and sent to the candidate.
3. **Manual evaluation:**
   1. Responses are assigned to evaluators (blind if set).
   2. They mark against the rubric.
   3. Disagreement goes to moderation.
   4. The final score is recorded, and T02 re-scoring is applied.
4. **Outcomes:**
   - **Hiring:** results go to the M10 pipeline (auto-advance per Q6).
   - **Training:** completion goes to M07, with the certificate (P05) and the competency mapping (T01 Q2).
5. **Retention:** a nightly job applies the tenant policies per data class, skips data under legal hold, and writes deletion records.

## 7. UI
- **Review queue (T2 list):** severity, SLA and type filters.
- **Reviewer capacity & SLA dashboard (T6, G7):** per reviewer: open items by severity, oldest item age against the incident SLA (3 working days, Q1) and the appeal SLA (10 working days, Q2), overdue count, items closed per week, capacity used vs cap, availability (leave / delegation); pool totals and a forecast of items due; actions: reassign (the COI check re-runs), pause a reviewer, change the cap. Configured in *Assessments › Integrity review* (APX-E #165, hub card C20).
- **Incident workspace:** synchronised camera + screen + companion playback, a timeline with flag markers, evidence list, verdict form.
- **Evaluator console:** rubric side panel, keyboard scoring, blind mode.
- **Candidate result page (portal):** what's visible per Q5, plus an appeal button during the window.
- **Privacy centre (candidate):** consents given, retention dates, withdraw / erase requests.

## 8. Migration & rollout
- Existing flags become incidents from go-live. Past attempts keep the integrity panel view.
- The existing 90-day sweep becomes the configurable retention policy; the shipped default is **30 days** (G17, Q7 amendment). Existing tenants keep their current 90-day value as an explicit setting until they change it.

Build order:
1. Incidents, evidence and verdicts, with the hash chain.
2. Result holds.
3. Rubrics and evaluators.
4. Appeals.
5. Collusion / plagiarism.
6. Retention and consent per jurisdiction.
7. Fairness report.
8. ATS auto-advance.
9. **Proctoring track, phase 2:** session report PDF (B5) → assessment webhooks → ATS connectors (Greenhouse and Lever first, then Workday, SAP SF, SmartRecruiters, iCIMS) (B6) → typing and CEFR scoring (B14) → badges → LTI 1.3 (B15) → AI-allowed scoring (C5).

## 9. Acceptance tests (samples)
- A single reviewer can't invalidate an attempt; a second review is required (YX-EVAL-01).
- A candidate with an open incident isn't moved in the ATS and sees "result under review" (YX-EVAL-03).
- An appeal is assigned to a reviewer other than the original one (YX-EVAL-04).
- Meera is the recruiter on Arjun's application and in the reviewer pool; Arjun's incident is never assigned to her, and a manual reassignment to her is refused with "conflict of interest: recruiter on this application"; with round-robin the next eligible reviewer gets it (YX-EVAL-15).
- With "by language" and a Tamil attempt, only Tamil-reading reviewers below their capacity cap are assigned; if none is eligible the item escalates to the pool owner (YX-EVAL-15).
- Two evaluators scoring 4 and 9 out of 10 (threshold 3) trigger a third evaluator (YX-EVAL-05).
- Identical wrong-answer patterns across 5 candidates in one drive raise collusion flags without changing their scores (YX-EVAL-07).
- Recordings under legal hold survive the retention sweep; others are deleted with a deletion record (YX-EVAL-08).
- A candidate declining face capture on a test that allows manual ID gets the manual path; on a test that doesn't, gets a clear message and the invite isn't consumed (YX-EVAL-09).
- An identity mismatch at the AI interview holds the application in review; the candidate re-verifies, the reviewer closes the incident as "re-verified" and the hold lifts; had the reviewer upheld it, the candidate could appeal to a different reviewer (YX-EVAL-30).
- After the verdict, the session report is "final" with timeline, 6 stills, flags, integrity score with weights and the verdict; a later successful appeal creates a new version that supersedes it (YX-EVAL-16).
- Moving a Greenhouse candidate to the mapped stage creates a YukthiX invitation; while an incident is open Greenhouse shows only "under review", and after release it shows the band and report link (YX-EVAL-17).
- A webhook subscriber fetching a held result gets "held" and no score (YX-EVAL-18).
- A writing response gets an AI-suggested B2; the result can't be released until an evaluator confirms or changes it, and the report names the confirming evaluator (YX-EVAL-19).
- A candidate typing 250 characters with 5 uncorrected errors in 1 minute scores 45 net WPM; pasted text is not counted and raises a flag (YX-EVAL-20).
- An invalidated certification attempt has its Open Badge and Credly badge revoked within 24 hours (YX-EVAL-21).
- A Moodle course launches a YukthiX test via LTI 1.3; the grade appears in the Moodle gradebook only after the result is released (YX-EVAL-22).
- In an AI-allowed coding test the evaluator sees each assistant exchange next to the answer and scores "verification of AI output" from it (YX-EVAL-23).
- A test's pass rate for women is 62 % of the rate for men across 400 attempts; a finding is raised and, under the starter template, the owner gets a review task while the test stays live (YX-EVAL-25, YX-EVAL-27).
- An evaluator's screen and export contain no demographic fields (YX-EVAL-24).
- A predictive-validity chart with 12 hires in a job family is suppressed below the minimum sample (YX-EVAL-28).
- J23: after the final appeal, recording a court case places a legal hold; the 30-day sweep skips its recordings, and the export's manifest hashes match its files and it includes the electronic-records certificate (YX-EVAL-31).
- R13: the NYC bias-audit export for AI interview scoring shows impact ratios by sex, race / ethnicity and intersections with no candidate names; 13 months after the last recorded audit, AI interview is blocked for a NYC job (YX-EVAL-32).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Incident review & verdicts | **Incident object with evidence bundle**; verdicts cleared / warning / section invalidated / attempt invalidated; **attempt invalidation needs two reviewers**; review SLA default **3 working days** (P03 reminders). |
| Q2 | Candidate appeals | Appeal within **7 days** of result / verdict; statement + attachments; **different reviewer**; candidate sees a **summary of evidence** (timestamps, flag types, key stills), not full recordings; decision in **10 working days**, final. |
| Q3 | Plagiarism, collusion & leaks | **Included:** cohort checks inside the tenant — code similarity (exists), MCQ answer-pattern + timing collusion in drives, text similarity between candidates. **Partner add-on:** external web plagiarism checks and **question-leak monitoring** (web / Telegram scanning for question text). |
| Q4 | Manual evaluation | **Rubrics** per question / test; default **1 evaluator**, optional **2 blind evaluators** for high-stakes with a disagreement threshold → third evaluator; **AI-suggested scores** (text / transcripts only) shown after the evaluator's own score; inter-rater agreement report per test. |
| Q5 | What candidates see | **Per test, with defaults:** hiring — status + optional band feedback (no answers); training — full report (score, skills, correct answers where allowed); results **held** while an incident / appeal is open; release modes as today (auto / manual / scheduled). |
| Q6 | Results → ATS & HRMS | **ATS:** per job, "suggest next stage" (default) or **auto-advance** when score rules pass and integrity is clear; **never auto-reject**. **HRMS:** training completions → M07 learning record + certificate (P05) + competency evidence via the T01 Q2 mapping. LTI 1.3 tool for external LMSs later. |
| Q7 | Retention | **Per tenant and data class:** recordings / clips / biometrics / ID images default **90 days** (configurable **30–365**); scores and answers follow ATS retention (M10 Q6) or the employee record; **legal hold** for open incidents / appeals / litigation; retention shown to candidates before consent. |
| Q8 | Consent, lawful basis & fairness | **Jurisdiction-aware consent** (India DPDP, EU GDPR Art. 9, US BIPA written release + published retention schedule) based on the candidate's location; **withdraw / erasure** self-service; **publish an annual fairness report** of the face models across skin tones and demographics; manual fallback always available (YX-EVAL-11). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Incident object with evidence bundle** (clips, stills, logs, timeline, hashes); verdicts cleared / warning noted / section invalidated / attempt invalidated; **attempt invalidation needs two reviewers** (or reviewer + test owner, YX-EVAL-01); review SLA default **3 working days** with P03 reminders. | 25 Sep 2026 |
| Q2 | **Appeals within 7 days** of result / verdict (statement + attachments); decided by a **different reviewer** (YX-EVAL-04); candidate sees an **evidence summary** (timestamps, flag types, key stills), not full recordings; decision within **10 working days**, final; windows configurable per tenant. | 25 Sep 2026 |
| Q3 | **Included:** in-tenant cohort checks — code similarity (exists), MCQ answer-pattern + timing collusion in drives, text similarity between candidates; **partner add-on (D15):** external web plagiarism and **question-leak monitoring** (web / Telegram scanning) with leak alerts → retire / rotate (T01 / T02); all results are flags only (YX-EVAL-07). | 25 Sep 2026 |
| Q4 | **Rubrics** (criteria × levels) per question / test; default **1 evaluator**, optional **2 blind evaluators** for high-stakes with a disagreement threshold → third evaluator / moderation (YX-EVAL-05); **AI-suggested score** from text / transcripts shown only after the evaluator's own score (YX-EVAL-06); inter-rater agreement report per test. | 25 Sep 2026 |
| Q5 | **The company decides what candidates see**, per test: each element can be switched on or off — status (pass / fail / under review), scaled score, band, percentile, skill breakdown, per-question correctness, correct answers / explanations, evaluator comments; release automatic / manual / scheduled (existing). YukthiX provides no fixed default beyond "status only" until the company configures it. Platform guardrail: results under an open incident or appeal are **held** (YX-EVAL-03). | 25 Sep 2026 |
| Q6 | **ATS:** per job, "suggest next stage" (default) or **auto-advance** when score rules pass and integrity is clear / cleared; **never auto-reject** (YX-EVAL-12). **HRMS:** training completion → M07 learning record + certificate (P05) + competency evidence via the T01 Q2 mapping. **LTI 1.3** tool for external LMSs later. | 25 Sep 2026 |
| Q7 | **Retention per tenant and data class:** recordings / clips / face data / ID images default **90 days**, configurable **30–365**; scores and answers follow ATS retention (M10 Q6) or the employee record; **legal hold** for open incidents / appeals / litigation; retention shown to candidates before consent; deletion records kept (YX-EVAL-08). **Amended 26 Sep 2026 (G17):** the default for recordings / clips / face data / ID images is **30 days**, not 90 (the range 30–365, legal hold and the other classes are unchanged; the original text is kept above for the record). | 25 Sep 2026 |
| Q8 | **Jurisdiction-aware consent** by candidate location (India DPDP, EU GDPR Art. 9, US BIPA written release + published retention schedule; other regions default to the strictest applicable text); **self-service withdraw / erasure** (YX-EVAL-10); **annual public fairness report** of face models across skin tones and demographics; manual fallback always available (YX-EVAL-11). Team action: legal review of consent texts per jurisdiction; fairness-test dataset. | 25 Sep 2026 |
| E16 (law) | **Under-18 test-takers (DPDP s.9):** verifiable guardian consent before biometric capture; no AI-assisted / LLM scoring beyond deterministic scoring; no profiling (YX-EVAL-13; M10 YX-ATS-19). | 26 Sep 2026 |
| E16 | **Candidate without a government ID:** alternate identity path, admit card + institution-attested photo or proctor manual verification, where the test allows (YX-EVAL-14). | 26 Sep 2026 |
| G7 (consistency fix) | **Reviewer assignment** (GAP-REGISTER G7): company-configurable assignment policy for incidents (and appeals / manual-evaluation queues) — round-robin (starter template, D17) / by language / by load — with per-test override, capacity caps and leave / delegation skipping; **conflict of interest**: reviewer ≠ recruiter / hiring manager / interviewer of that candidate, ≠ an employee test-taker's manager chain, ≠ the test-taker, no override, escalation to the pool owner when no one is eligible; **reviewer capacity & SLA dashboard**. Tables `review_assignment_policies`, `reviewer_pool_members`, `review_assignments`. Rule YX-EVAL-15; summary in [APX-E](APX-E-setup-admin.md) §5. | 26 Sep 2026 |
| B5 | **Gap-register extension (user decision 26 Sep 2026): post-exam session report PDF (T05 part).** Auto-generated per attempt for hiring managers / institutions: identity result, timeline, key stills (company-set count, default 6), flags with the 0–100 integrity score and its weights (T04 YX-PROC-14), incidents and verdict; final after review, provisional before; P05 document, viewer watermark, expiring share links; no ID images, recordings or accommodation details (YX-EVAL-16). Flags only — nothing auto-fails. Included in the Proctoring price (D18). Proctoring track, phase 2. | 26 Sep 2026 |
| B6 | **Gap-register extension (user decision 26 Sep 2026): ATS connectors + assessment webhooks.** Standard connectors for **Greenhouse, Lever, Workday, SAP SuccessFactors, SmartRecruiters, iCIMS**: send test from an ATS stage, status and released results / report link back, only company-chosen elements, held results show "under review", no evidence or answers leave YukthiX (YX-EVAL-17); **assessment webhooks** from the APX-B events (plus `session_report.ready`, to be added to APX-B), signed, retried, thin payloads (YX-EVAL-18). Standard connectors **included** in the Proctoring price; custom connections are paid customisation (D18). Extends P10 B3. Proctoring track, phase 2. | 26 Sep 2026 |
| B14 | **Gap-register extension (user decision 26 Sep 2026): CEFR and typing scoring (T05 part).** AI-suggested **CEFR-aligned** scores for speaking / writing (only transcripts / text to external AI, pronunciation from in-region audio features), **advisory**, human confirmation before release, individual human rating for high stakes, human-only for under-18s (YX-EVAL-19); deterministic **typing** scoring (net WPM, accuracy; company thresholds, starter 30 WPM / 90 %) with paste / injection flags (YX-EVAL-20). AI scoring uses AI credits (add-on, D18). Proctoring track, phase 2. | 26 Sep 2026 |
| B15 | **Gap-register extension (user decision 26 Sep 2026): badges + LTI 1.3 (T05 part).** Certificates issuable as **Open Badges 3.0** credentials and / or through the company's **Credly** account, revoked on invalidation / appeal (YX-EVAL-21); **LTI 1.3 / Advantage tool** (Deep Linking, grade passback after release, optional Names & Roles) so external LMSs can launch assessments — **supersedes "LTI 1.3 later" in Q6** (YX-EVAL-22). Included in the price; Credly's own fees are the company's third-party cost (D18). Equating and cut-score studies are in T02 (YX-TB-16 / 17). Proctoring track, phase 2. | 26 Sep 2026 |
| C5 | **Gap-register extension (user decision 26 Sep 2026): AI-allowed mode scoring (T05 part).** Rubric criteria for prompting quality, verification of AI output and final correctness; evaluators see the full assistant log; approved-assistant use is never an integrity issue in that test (YX-EVAL-23). The mode itself is in T04 (YX-PROC-16); keystroke dynamics in T04 (YX-PROC-15); centre mode, invigilator app and candidate survey in T03 (YX-DLV-18–20). Proctoring track, phase 2. | 26 Sep 2026 |
| Q9 (A13) | **Company decides per test (D17)** how YukthiX responds to an adverse-impact or item-bias finding: **alert + required review** (starter template) or **auto-suspend** the question / test from new attempts until a reviewer clears it. Every finding creates an audited review task (YX-EVAL-27). | 26 Sep 2026 |
| Q10 (A13) | **Predictive validity is on for suite customers** (Proctoring + HRMS): hires' scores linked to M06 ratings, time-to-productivity and retention; **aggregate only** with minimum sample sizes; stated in the privacy notices (YX-EVAL-28). | 26 Sep 2026 |
| Market analysis additions (G17) | **Retention default for proctoring evidence changed from 90 to 30 days** ([MARKET-COMPETITOR-ANALYSIS](MARKET-COMPETITOR-ANALYSIS.md) §4 G17; the setting the Amsterdam court accepted): recordings / clips / face data / ID images default **30 days**, company still sets **30–365**, legal hold honoured (Q7 amendment, YX-EVAL-08). T06 / T07 references to "default 90 days" follow this decision. | 26 Sep 2026 |
| Correction C4 (validation pass 3) | **A13 extended to employee-side AI for EU tenants** (EU AI Act Annex III(4) covers promotion / termination, task allocation and worker monitoring / evaluation; P10 §A4): the same adverse-impact analytics, group-data safeguards, Q9 finding response and human oversight apply to the attrition-risk band, AI in performance reviews, M12 allocation suggestions, individual M02 anomaly flags and psychometric scores used for promotion; `demographic_declarations` and `fairness_analyses` take an employee / AI-feature subject. Rule YX-EVAL-29. | 28 Sep 2026 |
| T10 | **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** **identity-mismatch and deepfake signals feed incidents and appeals** like other flags (explain / re-verify / appeal, human verdict only, holds while open); evidence and identity templates are Special, retained per YX-EVAL-08 (30-day default) and consent is jurisdiction-aware per Q8. Rule YX-EVAL-30; detection in T04 YX-PROC-19 / 20. | 28 Sep 2026 |
| J23 | **Validation pass 3 Should (J23), founder decision 28 Sep 2026:** **proctoring dispute after final appeal**: escalated state (legal notice, court, DPB complaint), legal hold on all incident evidence and records, court-ready sealed evidence export with electronic-records certificate (BSA 2023 s. 63, replacing s. 65B; **section to verify with counsel**) (YX-EVAL-31). Proctoring track. | 28 Sep 2026 |
| R13 | **Validation pass 3 Should (R13), founder decision 28 Sep 2026:** **NYC LL144 bias-audit export** from A13 fairness analytics (impact ratios by sex, race / ethnicity, intersections; no identities) and **yearly independent audit support** (scoped auditor access, audit date and summary URL recorded, feature blocked for NYC jobs when the audit is over a year old) (YX-EVAL-32). Before the first US AI-interview customer. | 28 Sep 2026 |
