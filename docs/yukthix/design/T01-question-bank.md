# T01 · Question Bank & Content

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026** with GAP-REGISTER **B4** (job-role profiles for starter tests / JD assembly) and **B14** (language proficiency and typing item types) — see §3 "Gap-register extensions" and §11.
> **Covers:** spec §1.1.1 Question Bank (attributes, rich content, multi-language, bank management); [exam-app reuse inventory §1.1.1](../reference/exam-app-reuse-inventory.md) (7 done, 7 partial, 9 missing).
> **Series:** Proctoring design docs T01–T05 (the same method as P01–P11 and M01–M10).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.
> **Builds on:**
> - P01 (tenancy);
> - P02 (roles, field classes);
> - P03 (review / approval workflow);
> - P05 (media storage);
> - P10 (AI tiers);
> - P11 (API-first: bank APIs and webhooks);
> - M06 Q8 (competencies: a **separate** library, linked only by an explicit test → competency mapping, Q2).

---

## 1. Purpose & scope
- A trustworthy, reusable bank of questions that serves all three use cases: job screening, recruitment drives and internal training (M07).
- Every question is **reviewed, versioned and measurable**, so tests stay fair and results stay comparable over time.

## 2. What exists today (exam app, `origin/main`) — keep / change / add

| Capability | Today | T01 |
|---|---|---|
| Types | `single_mcq, multi_mcq, true_false, code, essay, file_upload, spoken` | **Keep**. **Add** `video` response, `fill_blank`, `ordering`, `matching`, `sql` (SQL questions are wired in T02 / coding) |
| Difficulty | `easy / medium / hard`, separate from marks | **Change** per Q1 |
| Skill / category | Flat `topic`, `category`, `Tag` strings | **Add** hierarchical taxonomy (Q2); keep tags |
| Marks / negative marks | `Question.marks`, `negativeMarks`; section weights | **Keep**. **Add** per-test override (T02) |
| Expected time | Section-level only | **Add** per question (seconds) |
| Status | `active / archived`, AI drafts → publish | **Change** to draft → in review → approved → retired (Q3) |
| Versioning | None; edits in place; attempts snapshot questions; `answerKeyChangedAt` | **Add** versions (Q4); keep attempt snapshots |
| Usage statistics | Item analytics exist | **Keep**; per version |
| Rich content | Images, code snippets | **Add** audio / video in the body, LaTeX (KaTeX), attachments / reference files |
| Multi-language | None (only programming languages) | **Add** (Q5) |
| Collections / ownership | `createdBy` only | **Add** collections with owners and sharing |
| Review workflow | None | **Add** through P03 (Q3) |
| Import / export | Bulk import + template | **Add** export (CSV / XLSX / QTI) |
| Duplicate detection | Candidates only | **Add** for questions (embeddings exist) |
| Retirement | Archived questions stay in history | **Keep** |
| AI question generation | AI drafts exist | **Add** guardrails (Q8) |

## 3. Concepts
- **Question:** a stable identity with **versions**. Each version holds:
  - type, body (rich text with media and LaTeX), options / answer key / test cases;
  - marks, negative marks, difficulty, expected time;
  - skills, tags, languages;
  - explanation / model answer.
- **Version kinds:**
  - **Minor:** typo, formatting, image quality. Scoring is unchanged. No new number.
  - **Major:** stem, options, answer key or test cases change. This creates a new version number (Q4).
- **Skill taxonomy:** domain → skill → sub-skill (e.g. *Software Engineering → Java → Streams API*). **Proctoring keeps its own library, separate from the HRMS competency library (M06)** (Q2): YukthiX starter taxonomy + tenant extensions. Where HRMS wants a test to count as evidence (M06 Q8, M07), the test owner maps the test to a competency explicitly. *(Amended 28 Sep 2026, T2: this taxonomy is now a mapped view of the company skills library in M06, YX-PERF-20; see YX-QB-16.)*
- **Collection:** a folder of questions. It has an owner, editors and viewers, and can be shared inside the tenant.
- **Language variant:** a translation of a question version, with its own review status (Q5).
- **Question status:** draft → in review → approved → retired. Only **approved** versions can be put into a published test.
- **Content source:** tenant-authored, AI-drafted (Q8), imported, or a YukthiX library pack (Q7).

### Gap-register extensions (26 Sep 2026; Proctoring track, phase 2)
- **Job-role profile (B4):** job role × level (e.g. *Java Backend Developer · L2 / 2–4 yrs*) → weighted skills from the taxonomy, with a suggested difficulty mix. YukthiX ships a **labelled starter catalogue** of role profiles (D17); tenants copy and edit. Role profiles feed the T02 **starter test library** (YX-TB-13) and **AI test assembly from a JD** (YX-TB-14). Starter questions (Q7) are tagged with the role profiles they suit.
- **Language proficiency items (B14):** CEFR-aligned content in the four skills:
  - **reading / listening:** existing types (MCQ, fill-blank, ordering) with text or audio stimulus;
  - **speaking:** the existing `spoken` type with a CEFR speaking rubric (prompt, preparation time, response time, max retakes);
  - **writing:** `essay` with a CEFR writing rubric and a word range.

  Each item carries a **target CEFR level** (A1–C2) in addition to the Q1 difficulty. Scoring (AI-advisory, human review for high stakes) is in T05 YX-EVAL-19. The starter library (Q7) adds an English proficiency set; tenants may author proficiency items for any target language.
- **Typing test (B14):** new question type `typing` — a passage (or random passage from a set) with a duration; measures net words per minute, accuracy % and uncorrected errors. Scored deterministically (T05 YX-EVAL-20).
- **Skills as a mapped view (T2, 28 Sep 2026).** Question skill tags now point at the **company skills library** in M06 (YX-PERF-20): the proctoring domain → skill → sub-skill tree is a **mapped view** of that library, so a question tag, an M06 competency and an M10 scorecard skill resolve to the same skill. Proctoring phase 2.
- **Job simulations and AI role-play items (T13).** Non-technical item types: **in-tray** (an inbox of emails / documents to prioritise and act on), **support chat / email simulation** (reply to a scripted customer thread) and **AI role-play** (the candidate chats or talks with an AI persona, e.g. an upset customer or a sales prospect, driven by a persona script and scored against a rubric). Proctoring phase 2.

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `questions` | Identity, collection, owner, current approved version, status, source |
| `question_versions` | Number, kind (major / minor history), type, body JSON (rich blocks), marks, negative marks, difficulty, expected_seconds, explanation, created_by, approved_by, approved_at |
| `question_options` / `question_answer_keys` / `question_test_cases` | Per version |
| `question_translations` | Version × language: translated body / options, translator (human / AI-assisted), review status |
| `question_media` | Image / audio / video / attachment refs (BlobStorage), captions / transcripts for accessibility |
| `skills` | Proctoring taxonomy tree (domain / skill / sub-skill), platform starter catalogue + tenant extensions; separate from M06 `competencies` (Q2) |
| `question_skills` | Version → skill(s), weight |
| `collections` + `collection_members` | Ownership and sharing |
| `question_reviews` | Review requests (P03), reviewer comments per field, decision |
| `question_similarity` | Near-duplicate pairs with score, status (confirmed duplicate / not duplicate) |
| `question_usage` | Per version: times served, % correct, discrimination, exposure (feeds T02 psychometrics) |
| `job_role_profiles` + `job_role_profile_skills` | Role, level, description, source (YukthiX starter / tenant copy), copied_from; skill × weight × suggested difficulty mix (B4). Starter rows are platform catalogue; tenant copies carry `organization_id` |
| `question_role_tags` | Question version → job-role profile(s) it suits (B4) |
| `question_versions` (added fields, B14) | `cefr_level` (A1–C2, nullable), `cefr_skill` (reading / listening / speaking / writing); for `typing`: passage set ref, duration, backspace allowed, min accuracy to count |
| `skills` (change, T2) | Kept as the proctoring **mapped view**: each node maps to one M06 `company_skills` row through `skill_mappings` (view `proctoring_tag`); starter nodes map automatically |
| `question_versions` (added fields, T13) | Types `in_tray`, `sim_chat_email`, `ai_role_play`; `persona_script` JSON (role-play: persona, topics allowed, max turns, ending conditions), simulation assets (P05 refs), rubric ref |

All tables carry `organization_id` + RLS, except the platform taxonomy and YukthiX library packs, which are platform catalogue tables (P07 YX-STAT-10). Answer keys are **Confidential**: visible to authors, reviewers and test admins, and never sent to the candidate runtime before submission.

## 5. Rules (YX-QB)

| ID | Rule |
|---|---|
| YX-QB-01 | Only **approved** question versions can be added to a test that is being published. Draft / in-review versions can be previewed only. |
| YX-QB-02 | A **major** change always creates a new version. Published tests keep the version they were built with until the test owner upgrades them (Q4). Attempts keep a snapshot of the exact version served. |
| YX-QB-03 | Changing an answer key on a version already served offers a **re-grade** of affected attempts. The re-grade is audited and follows T05 result-release rules; it never silently changes released results. |
| YX-QB-04 | Marks and difficulty are separate fields. Difficulty uses the Q1 scale. Calibrated difficulty from T02 is stored alongside, never overwriting the authored value. |
| YX-QB-05 | Every question has at least one skill from the taxonomy before approval. Tags stay free-form. |
| YX-QB-06 | Retiring a question removes it from future test building. Historical attempts, reports and item statistics remain intact. |
| YX-QB-07 | The duplicate check runs on save (text + embedding similarity against the tenant bank). Near-duplicates above the threshold must be confirmed "not duplicate" by the reviewer before approval. |
| YX-QB-08 | A translation is served only when it is approved. A candidate's chosen language applies to the whole attempt. Code, formulas and option order stay identical across languages, so scores are comparable (Q5). |
| YX-QB-09 | Answer keys, test cases and model answers never reach the candidate runtime (browser) before the attempt is submitted. |
| YX-QB-10 | AI-generated questions are labelled with their source, always start as **draft**, and go through the same review (Q8). |
| YX-QB-11 | Media in questions carries alt text / captions (audio and video need a transcript) before approval (T03 accessibility). |
| YX-QB-12 | Export includes versions, translations, skills and media references in CSV / XLSX, and in **QTI 2.1** for portability. Answer keys are exported only by users with the answer-key permission. |
| YX-QB-13 | **Job-role profiles (B4).** YukthiX starter role profiles are read-only, labelled "YukthiX starter" and versioned; a tenant **copies** a profile to edit it (D17). Updates to a starter profile show "newer starter version" on the tenant copy and are never applied automatically. Every profile skill must exist in the taxonomy (YX-QB-05). |
| YX-QB-14 | **Language proficiency items (B14).** A speaking or writing item can be approved only with a CEFR rubric attached and a target CEFR level. Recordings stay in-region; only transcripts / written text may reach external AI (P10, M10 R1, Q6). AI scoring is offered only for target languages YukthiX has validated (English at launch of this phase); other target languages are human-scored. |
| YX-QB-15 | **Typing items (B14).** Passages are rendered so they can't be copied into the answer (paste disabled, text not selectable); per-keystroke timings are captured for scoring and integrity only (T05 YX-EVAL-20, T04 YX-PROC-15) and follow biometric-class retention when keystroke dynamics is enabled. |
| YX-QB-16 | **Skill tags from the library (T2).** A question's skill tags are chosen from the company skills library (M06 YX-PERF-20) through its proctoring view; a tenant may keep its own domain / sub-skill labels, but each maps to exactly one library skill. Starter-taxonomy tags map automatically; an unmapped custom tag blocks approval until an author maps it. Renaming or merging a library skill updates the view, never a question version's history. |
| YX-QB-17 | **Simulation and role-play items (T13).** An `in_tray`, `sim_chat_email` or `ai_role_play` item is approved only with a rubric (criteria, levels, anchors) and, for role-play, a human-reviewed **persona script** with boundaries (topics, max turns, ending conditions). The AI persona sees only the script and the candidate's turns, never answer keys or other candidates; voice stays in-region and only text goes to external AI (as YX-QB-14). AI rubric scores are advisory; for hiring or promotion a human confirms them (T02 YX-TB-19, P10 YX-AI-01). |

## 6. Flows
1. **Author:**
   1. Create a question in a collection (or AI-draft it, or import it).
   2. The duplicate check runs.
   3. Submit for review.
   4. The reviewer comments or approves (P03 chain per Q3).
   5. The question is approved and available to test builders.
2. **Edit an approved question:**
   - A minor edit is saved directly and audited.
   - A major edit creates a new draft version and goes through review. Tests show "newer version available" to their owner.
3. **Translate:**
   1. Choose the target languages.
   2. An AI-assisted draft is created (P10 tiers; answer keys are never sent).
   3. A bilingual reviewer approves it.
   4. The variant is live.
4. **Retire:** from bank management, with a usage check showing the tests using it; it is blocked while a published test depends on it, unless replaced.

**Events emitted:** `question.approved`, `question.version.created`, `question.retired` (P11 webhooks).

## 7. UI
- **Bank explorer (T2 list):**
  - facets: skill tree, difficulty, type, status, language, collection, usage;
  - bulk actions.
- **Question editor:**
  - rich blocks (text, LaTeX, code, image, audio, video, attachment);
  - live candidate preview (desktop and mobile), with a language switcher;
  - a version timeline.
- **Review queue:** side-by-side diff between versions, comment per field, approve / request changes.
- **Item stats panel:** served, % correct, discrimination, exposure (from T02).

## 8. Migration & rollout
Existing questions become **version 1, approved** (they are already live). Other migration steps:
- `topic` / `category` values are mapped to the taxonomy with a matching wizard.
- `easy / medium / hard` map to the Q1 scale.

Build order:
1. Versions, statuses and review.
2. Taxonomy.
3. Rich media and LaTeX.
4. Translations.
5. Export and duplicates.
6. Library packs (Q7).
7. **Proctoring track, phase 2:** job-role profiles (B4), CEFR speaking / writing items and the `typing` type (B14).

Proctoring is not bound to the HRMS waves. It runs as its own track (team capacity permitting).

## 9. Acceptance tests (samples)
- Editing the answer key of an approved question creates v2. The published test still serves v1 until upgraded (YX-QB-02).
- Changing the key of v1 after 200 attempts offers a re-grade. Released results don't change until the re-grade is released (YX-QB-03).
- A draft question can't be added to a test being published (YX-QB-01).
- A near-duplicate (95 % similar) blocks approval until marked "not duplicate" (YX-QB-07).
- A candidate choosing Tamil sees Tamil for all translated questions and English for any without an approved translation, and the report shows the language (YX-QB-08).
- The candidate browser's network log contains no answer keys before submission (YX-QB-09).
- A tenant copies the starter "Java Backend Developer · L2" profile and changes a skill weight; the starter profile is unchanged, and a later starter update shows "newer starter version" on the copy without changing it (YX-QB-13).
- A speaking item without a CEFR rubric can't be approved; for an approved one, a network trace during scoring shows only the transcript going to the external model (YX-QB-14).
- On a `typing` item, pasting the passage into the answer box is blocked and the passage text can't be selected (YX-QB-15).
- T2: a custom tag "Spring Boot" not mapped to a library skill blocks approval; after mapping it to *Java › Spring*, the tag, the M06 competency and the M10 scorecard skill show the same skill (YX-QB-16).
- T13: an AI role-play item without a persona script can't be approved; in a run, a network trace shows only the persona script and the text turns going to the external model (YX-QB-17).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Difficulty scale | **5 levels** (very easy … very hard) authored by humans, mapping existing easy / medium / hard to 2 / 3 / 4; **calibrated difficulty** from real results (T02 IRT) shown next to it once enough data. |
| Q2 | Skill taxonomy | **Shared taxonomy:** YukthiX ships a standard library (IT, business, aptitude, languages, HR / compliance) and each tenant extends it; **the same library as M06 competencies**, so test results can update employee skill profiles. |
| Q3 | Review workflow | **Configurable per collection:** default author → 1 reviewer (approval); optional second approver for high-stakes collections; small tenants can self-approve with a reason (P02 Q6 pattern). |
| Q4 | Versioning & upgrades | **Minor vs major** edits; major = new version; published tests stay pinned and show "newer version available"; owner upgrades per test; answer-key fixes offer re-grade (YX-QB-03). |
| Q5 | Question languages | **English, Hindi, Tamil, Telugu** at launch (same as P04), more later; **AI-assisted translation with mandatory human review**; candidate picks the language at start; code / formulas stay unchanged. |
| Q6 | New response types | **Add video response** (record in browser, max 3 min, retakes per question setting), **fill-in-blank, ordering, matching** and **SQL** questions; video / audio answers transcribed for review; transcripts may go to external AI for scoring help, recordings stay in-region (P11/M10 R1 pattern). |
| Q7 | Ready-made question content | **Ship a starter library** (aptitude, English, core IT skills) **included in the plan**; **licensed content packs from partners** (e.g. certification-grade banks) as a paid add-on (partner per-use cost, D15). |
| Q8 | AI question generation | **Keep and harden:** AI drafts from a skill + difficulty + type, always draft status, labelled "AI-generated", duplicate / similarity check, mandatory human review; AI never sees the tenant's other answer keys; AI usage metered (credits). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **5-level authored difficulty** (very easy … very hard); existing easy / medium / hard map to 2 / 3 / 4; **calibrated difficulty** from real results (T02 IRT) shown alongside once enough responses, never overwriting the authored value (YX-QB-04). | 25 Sep 2026 |
| Q2 | **Separate libraries:** Proctoring keeps its own skill taxonomy (domain → skill → sub-skill; YukthiX starter taxonomy + tenant extensions), independent of the HRMS competency library (M06). Cross-product use only through an **explicit mapping** a test owner sets (test → competency), used by M06 Q8 skills tests and M07 assessments. **Amended 28 Sep 2026 (Validation pass 3 Should T2):** replaced by one company skills library with mapped views (M06 YX-PERF-20; YX-QB-16); the explicit test → competency mapping is no longer needed because tags and competencies point at the same library skill. | 25 Sep 2026 |
| Q3 | **Review workflow configurable per collection:** default author → 1 reviewer approves; optional second approver for high-stakes collections; sole-author tenants may self-approve with a written reason (P02 Q6 pattern); runs on the P03 engine. | 25 Sep 2026 |
| Q4 | **Minor vs major edits:** minor (typo, formatting, media quality) saved directly and audited; major (stem, options, answer key, test cases) = new version through review; published tests stay pinned with a "newer version available" prompt, owner upgrades per test; answer-key fixes offer an audited re-grade of affected attempts (YX-QB-03). | 25 Sep 2026 |
| Q5 | **English, Hindi, Tamil, Telugu at launch** (P04 set; more later); AI-assisted translation drafts (answer keys never sent, P10 tiers) with **mandatory bilingual human review**; candidate picks language at start for the whole attempt; code, formulas and option order identical across languages (YX-QB-08). | 25 Sep 2026 |
| Q6 | **New response types:** video (browser-recorded, max 3 min, retakes per question setting), fill-in-blank, ordering, matching, SQL (sandboxed DB per T02 coding); video / audio answers transcribed for reviewers; **only transcripts may go to external AI** for scoring help, recordings stay in-region (M10 R1 / P10 pattern). | 25 Sep 2026 |
| Q7 | **Starter library included in the Proctoring plan** (aptitude, English, core IT skills; YukthiX-maintained, read-only, tenants copy to customise); **licensed partner content packs as a paid add-on** (per-use partner cost, spec D15). Team action: build starter content; pick content partners. | 25 Sep 2026 |
| Q8 | **AI generation kept with guardrails:** drafts from skill + difficulty + type (+ optional source material), always **draft**, labelled "AI-generated", duplicate / similarity check, mandatory human review (YX-QB-10); AI never receives the tenant's answer keys or other questions beyond the prompt; usage metered via AI credits (P10). | 25 Sep 2026 |
| B4 | **Gap-register extension (user decision 26 Sep 2026): job-role profiles.** YukthiX starter catalogue of job role × level → weighted skills + difficulty mix (labelled starter template, D17); tenants copy and edit; starter updates never auto-applied (YX-QB-13); starter questions tagged by role. Feeds the T02 starter test library (YX-TB-13) and JD-based AI assembly (YX-TB-14). Included in the Proctoring price (D18). Proctoring track, phase 2. | 26 Sep 2026 |
| B14 | **Gap-register extension (user decision 26 Sep 2026): language proficiency and typing.** CEFR-aligned reading / listening / speaking / writing items with a target CEFR level and mandatory CEFR rubric for speaking / writing (YX-QB-14); English proficiency set added to the starter library; new `typing` question type (net WPM, accuracy, uncorrected errors; YX-QB-15). Recordings in-region, only transcripts / text to external AI (P10, M10 R1). Scoring in T05 (YX-EVAL-19 / 20). Included in the price; AI scoring consumes AI credits (add-on, D18). Proctoring track, phase 2. | 26 Sep 2026 |
| T2 | **Validation pass 3 Should (T2), founder decision 28 Sep 2026:** **one skills library with mapped views — amends Q2** (separate libraries; the Q2 row is kept with an amendment note). The company skills library lives in **M06** (YX-PERF-20); question tags become its proctoring view (YX-QB-16), beside M06 competencies and M10 scorecard skills; AI suggests skills from CVs, tests, projects and courses and the employee or manager confirms (M06). Wave 5 (library); proctoring mapping in Proctoring phase 2. | 28 Sep 2026 |
| T13 | **Validation pass 3 Should (T13), founder decision 28 Sep 2026:** non-technical **job simulations** (in-tray, support chat / email) and **AI role-play** items with rubric and human-reviewed persona script, text-only to external AI, advisory AI scores confirmed by a human for hiring / promotion (YX-QB-17); test sections in T02 YX-TB-19; EU AI Act row in P10 §A4. Proctoring phase 2. | 28 Sep 2026 |
