# T06 · Psychometric & Behavioural Assessments

> **Status:** ✅ Decided (6/6), 26 Sep 2026.
> **Covers:** GAP-REGISTER **A11**. Psychometric, personality, behavioural and cognitive-ability tests: Big Five-type personality, situational judgement tests (SJT), cognitive ability (numerical / verbal / logical / abstract), work-style and culture-fit, and motivation / values.
>
> Competitors: SHL, Aon (cut-e), Mercer Mettl, TestGorilla, Wheebox, Xobin.
>
> **Builds on:**
> - T01: question bank, versions, languages, review;
> - T02: test builder, IRT, norms, exposure;
> - T03: delivery, accessibility, accommodations;
> - T04: proctoring modes;
> - T05: evaluation, release, consent, fairness, retention;
> - P09: analytics and suppression;
> - P10: AI tiers;
> - M06: competencies (explicit mapping only, T01 Q2);
> - M10: ATS stages.
>
> **Pricing (D18):** included in the per-attempt price. **Licensed third-party instruments** (e.g. a validated commercial personality inventory) are a partner add-on.
> **Build:** Proctoring track, phase 2 (after T01–T05 core).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
Let companies measure more than knowledge:
- how people think (cognitive ability);
- how they tend to behave (personality / work style);
- how they judge realistic work situations (SJT);
- what motivates them.

All in a **fair, explainable and legally defensible** way, for hiring, development (M06 IDPs, M07) and campus drives.

**Not in scope:** clinical or medical psychological assessment, which is never offered. Out of scope too are lie-detection claims and emotion recognition from video or voice (prohibited by T05 fairness principles and the EU AI Act).

## 2. What exists today
- The exam app has a question bank and scoring for knowledge tests only.
- There are no Likert / forced-choice items, trait scales, norm groups or narrative reports.
- T01–T05 provide the delivery, proctoring, IRT, retention and consent foundations this doc reuses.

## 3. Concepts
- **Instrument:** a psychometric test with a defined purpose, scales, item set, scoring model, norm groups, report templates and validity evidence. Sources:
  - **YukthiX starter instruments** (built and validated by YukthiX);
  - **licensed partner instruments** (add-on);
  - **tenant-built instruments** (Q3).
- **Item formats** (new T01 types):
  - **Likert** (agree 1–5);
  - **forced-choice** (pick most / least like me from a block, to reduce faking);
  - **SJT** (scenario + ranked or rated responses, scored against an expert key);
  - **cognitive** items (numerical, verbal, logical, abstract; timed, IRT-calibrated per T02).
- **Scale / trait:** a dimension measured by several items (e.g. Conscientiousness, Collaboration). The scale score is computed from raw → norm-referenced (sten / percentile) against a **norm group**.
- **Norm group:** a reference population (e.g. "Indian graduates 2026", "sales professionals"). YukthiX norms come from anonymised, opt-in data (Q4). Tenants may build their own norm group once they have enough data.
- **Job profile / fit:** the target ranges of scales for a role, set by the company or suggested from a job analysis. The fit report compares a candidate to the profile. It is **advisory**.
- **Validity & reliability evidence:** per instrument: internal consistency (α / ω), test-retest, construct validity, adverse-impact checks (A13), with a version and date.
- **Reports:**

  | Report | For |
  |---|---|
  | **Recruiter report** | Scores, fit, interview prompts to probe |
  | **Candidate feedback report** | Plain-language strengths and development areas, visibility per T05 Q5 |
  | **Development report** | Employee version for IDPs |

- **Response-quality signals:** too-fast responding, straight-lining, inconsistency index, social-desirability indicator. Flags only (T04 principle).

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `instruments` | Name, purpose, source (starter / licensed / tenant), version, status, validity evidence ref, languages, time limit |
| `instrument_scales` | Scale definitions, item-to-scale keys, reverse keying, scoring model (sum / IRT / Thurstonian for forced-choice) |
| `norm_groups` | Population description, size, date, statistics per scale, source (platform / tenant), status |
| `job_profiles` | Role, target ranges per scale, source (company / job analysis), approver |
| `psychometric_results` | Attempt × scale: raw, normed score (sten / percentile), confidence band, response-quality flags, norm group used, instrument version |
| `psychometric_reports` | Generated report per audience, template version, released_at |
| `validity_studies` | Instrument × study type (reliability / validity / adverse impact / predictive), sample, results, date |

All tables carry `organization_id` + RLS, except platform starter instruments and platform norms (platform catalogue). Results are **Confidential**. Raw item responses are **Special** for personality instruments (they reveal personal traits).

## 5. Rules (YX-PSY)

| ID | Rule |
|---|---|
| YX-PSY-01 | Psychometric results are **advisory**. They are never the sole basis for rejection; an ATS stage can't auto-reject on a psychometric score (T05 YX-EVAL-12). |
| YX-PSY-02 | Every instrument shown to customers has published reliability and validity evidence, with a version. An instrument without sufficient evidence can only be used in "research / development" mode, not for hiring decisions. |
| YX-PSY-03 | Scores are reported against a named norm group with confidence bands. Mixing norm groups in one comparison is blocked. |
| YX-PSY-04 | Personality and SJT instruments are **not timed per item** and not proctored beyond the test's mode. Cognitive instruments are timed and may use Record & review. |
| YX-PSY-05 | Response-quality signals (too fast, straight-lining, inconsistency) are flags for the reviewer, never automatic invalidation. |
| YX-PSY-06 | No clinical, medical or mental-health inference; no emotion recognition from face or voice. Report wording is reviewed against a banned-claims list. |
| YX-PSY-07 | Candidate consent (T05) states the purpose, who sees results and retention. Candidates are offered their own feedback report where the company enables it (T05 Q5). |
| YX-PSY-08 | Adverse impact and differential item functioning are monitored per instrument and per tenant use (A13); results below the 4/5ths rule trigger a review alert to the instrument owner. |
| YX-PSY-09 | Tenant-built instruments follow the T01 review workflow and must reach the YX-PSY-02 evidence threshold before hiring use (Q3). |
| YX-PSY-10 | Job-profile fit is shown as ranges and "probe" prompts for interviewers, never as a pass / fail badge. |
| YX-PSY-11 | Employee psychometric results are for development by default and visible to the employee; use in promotion / termination decisions requires the company to enable it per assessment, HR-only approval, and a prior notice to the employee; such use is audited. |

## 6. Flows
1. **Choose an instrument:** library → preview items and sample report → validity sheet → add to a test (T02) alone or with knowledge sections.
2. **Set a job profile:** pick a role template or run a short job analysis (hiring manager rates the importance of competencies) → target ranges → approval.
3. **Candidate / employee takes it** (T03). Instructions stress honesty and that there are no right / wrong answers for personality sections.
4. **Scoring:** raw → scale → norm → fit → reports generated → released per T05.
5. **Review:** the recruiter sees the report with interview probes. Quality flags are reviewed. The decision is made by humans.
6. **Evidence upkeep:** nightly / periodic reliability, adverse-impact and norm refresh jobs → validity studies updated → alerts.

## 7. UI
- **Instrument library:**
  - cards showing purpose, time, languages and evidence badges;
  - a sample report.
- **Job-profile editor:** scale ranges on sliders, with a job-analysis wizard.
- **Recruiter report:** a scale profile chart with norm bands, fit summary, interview probes and quality flags.
- **Candidate feedback report:** plain language, strengths first, with no scores that could be misread (per company setting).
- **Instrument owner console:** validity studies, norms, adverse-impact dashboard (A13).

## 8. Migration & rollout
Proctoring track phase 2:
1. Cognitive ability (reuses T02 IRT).
2. SJT.
3. Personality with forced-choice.
4. Norms.
5. Partner instruments.

Starter instruments need a pilot data collection (norming sample) before hiring use (YX-PSY-02).

## 9. Acceptance tests (samples)
- An ATS rule "reject if Conscientiousness < 4" can't be saved (YX-PSY-01).
- An instrument without evidence shows "development use only" and can't be attached to a hiring test (YX-PSY-02).
- A candidate completing 60 personality items in 90 seconds is flagged "too fast", not invalidated (YX-PSY-05).
- The report generator rejects the phrase "shows signs of anxiety disorder" (YX-PSY-06).
- An adverse-impact ratio of 0.72 for a group raises an alert to the instrument owner (YX-PSY-08).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Which instrument types at launch of phase 2? | **All four families:** cognitive ability, SJT, personality / work style (forced-choice), motivation / values; delivered progressively in that order. |
| Q2 | Where do instruments come from? | **Both:** YukthiX **starter instruments** built and validated in-house (included) **and licensed partner instruments** (validated commercial inventories) as a partner add-on for customers who want a known brand. |
| Q3 | Can companies build their own instruments? | **Yes, with guardrails:** tenant-built instruments go through T01 review and are usable for **development** immediately, for **hiring** only after reaching the evidence threshold (reliability, sample size, adverse-impact check). |
| Q4 | Norms | **Platform norms** from anonymised, **opt-in** pooled data across tenants (k-anonymity, no tenant identifiable) + **tenant-specific norms** once a tenant has enough data; norm group always named on reports. |
| Q5 | Candidate feedback | **Company decides** (D17) whether candidates get a feedback report; the YukthiX starter template gives a short strengths-first report; development reports always go to employees. |
| Q6 | Use for existing employees | **Allowed for development** (IDPs, coaching, team insights) with consent and results visible to the employee; **not used for promotion / termination decisions unless the company explicitly enables it per assessment**, with an HR-only approval and a notice to the employee. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **All four families:** cognitive ability (numerical, verbal, logical, abstract), situational judgement (SJT), personality / work style (forced-choice), motivation / values; delivered in that order within the proctoring track phase 2. | 26 Sep 2026 |
| Q2 | **Both:** YukthiX starter instruments built and validated in-house (included in the per-attempt price) **and licensed partner instruments** as a third-party add-on (D18). Team action: plan the norming study and choose instrument partners. | 26 Sep 2026 |
| Q3 | **Tenant-built instruments allowed with an evidence guardrail:** T01 review; usable for **development** immediately; for **hiring** only after the YX-PSY-02 evidence threshold (reliability, sample size, adverse-impact check) (YX-PSY-09). | 26 Sep 2026 |
| Q4 | **Platform norms** from anonymised, **opt-in** pooled data (k-anonymity, no tenant identifiable) **+ tenant-specific norms** once a tenant has enough data; the norm group is always named on reports and mixing norm groups is blocked (YX-PSY-03). | 26 Sep 2026 |
| Q5 | **Company decides** (D17) whether candidates receive a feedback report; starter template = short, plain-language, strengths-first report; employees always receive their development report (YX-PSY-07). | 26 Sep 2026 |
| Q6 | **Employees:** allowed for **development** (IDPs, coaching, team insights) with consent, results visible to the employee; **not used for promotion / termination decisions** unless the company explicitly enables it per assessment with HR-only approval and a notice to the employee. New rule YX-PSY-11. | 26 Sep 2026 |
