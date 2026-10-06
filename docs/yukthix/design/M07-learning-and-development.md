# M07 · Learning & Development

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026:** content marketplace & provider connectors, live-class auto-creation, gamification (GAP C2); Open Badges 3.0 / Credly and an LTI 1.3 tool (GAP B15 part); §11 C2 / B15.
> **Covers:**
> - spec §1.3.9: programmes and enrolment with nominations and approval, completions and certifications with expiry and renewal, training needs from skill gaps and appraisals, and assessments through §1.1;
> - spec §1.1.16: LMS via SCORM / xAPI;
> - Frappe reference [09 §1](../reference/frappe-hrms-functional-spec/09-training-grievance-misc.md) (MS-D1, MS-D2);
> - UI reference 09 (U86, U87);
> - Phase 2 P2 item: training needs.
>
> **Build wave:** 5.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Competency framework | Skill gaps emit `perf.skill_gap.found` → training needs | M06 Q8 |
| Approvals | P03 engine for nominations and external training requests | P03 |
| Certificates | Issued as P05 documents with QR verification (on by default) and the exam app's public verify page | P05 Q5 |
| Notifications | Reminders, quiet hours, WhatsApp for key events | P04 |
| Mobile | Every employee flow is on mobile | M04 YX-MOB-01 |
| Recoveries at exit | Go into F&F | M01 Q7 |
| Calendar / meeting connectors | Google / Microsoft OAuth, free/busy, meeting links; reused for live classes (YX-LRN-11) | P10 §B |
| IDPs | Course items in an M06 IDP arrive here as enrolment requests | M06 YX-PERF-14 |
| Other B15 parts | Equating, cut-score studies and certification-exam depth stay in T02 / T05 | GAP B15 |

---

## 1. Purpose & scope
Get the right people trained on time, especially **mandatory / compliance training** (POSH awareness, safety, code of conduct). Prove it with records and certificates, and close skill gaps.

## 2. What exists today (exam app) — our advantage

| Asset | Reuse |
|---|---|
| **Assessment engine (§1.1)** | Pre and post tests, final exams, proctored certification tests, question banks, auto-grading |
| `CertificateTemplate` + PDF + `/verify/[id]` | Training certificates (today they are tied to exam attempts; **generalise** to any completion) |
| Face verification / proctoring | Optional proctored exams for high-stakes certifications |
| Item analytics | Question and test quality for training assessments |
| BlobStorage | Course content (video, PDF, SCORM packages) |

SCORM / xAPI is **missing** in the exam app (reuse inventory §1.1.16). This module adds it, and proctoring then gets LMS integration too.

## 3. Concepts
- **Course:** a reusable learning item. Types:
  - **session-based**: classroom, virtual or on-the-job;
  - **self-paced**: video, PDF, link, SCORM package (Q1);
  - **assessment-only**.

  Each course has a duration, a skill/competency mapping with the level gained, cost, an optional certificate template and validity (months).
- **Programme / learning path:** an ordered set of courses, e.g. "New manager track". Completing the path can award a certificate.
- **Session:** a scheduled run of a session-based course. It has dates, venue or link, trainer (internal or external), seats and waitlist, attendance (Q7), cost and a feedback form.
- **Enrolment:** employee × course / path / session. It has a source (self / nominated / auto-assigned rule / training need), status, due date, progress, score and completion date. It moves through: requested → approved → enrolled → in progress → completed / failed / no-show / withdrawn. When the course has an assessment, enrolling automatically creates an **employee test invitation** (T03 test-taker, YX-DLV-13); the attempt result and any certificate flow back to the enrolment.
- **Assignment rule:** "who must complete what by when". Examples: all new joiners → POSH awareness within 30 days; factory workers → fire safety every 12 months (Q3).
- **Certification:** an issued certificate with expiry; renewal is auto-enrolled before expiry.
- **Training need:** a gap raised by a performance review, a competency gap, a manager request or a compliance rule. It is planned into a course or session (Q4).
- **Content provider connector (C2):** a link to LinkedIn Learning, Coursera or Udemy Business using the **customer's own licence** and API credentials. The provider's catalogue appears as **external courses**; enrolments are pushed where the provider allows and progress / completions are synced back (YX-LRN-10).
- **Content marketplace (C2):** one catalogue view over the company's own courses, connected providers and **licensed content packs** offered through YukthiX partners (licensed content is an add-on, D18).
- **Live class (C2):** a virtual session whose Zoom, Teams or Meet meeting is created automatically through the P10 calendar connectors (YX-LRN-11).
- **Gamification (C2):** points, badges and leaderboards for learning, behind a company switch; an individual can opt out (YX-LRN-12).
- **Open Badge (B15):** a certification also issued as a signed **Open Badges 3.0** credential, or through the company's **Credly** account (YX-LRN-13).
- **LTI 1.3 tool (B15):** YukthiX registered as a tool in an external LMS (Moodle, Canvas, Cornerstone, SAP SuccessFactors Learning and others), which can then launch YukthiX courses and assessments and receive the grade back (YX-LRN-14).
- **AI course and quiz authoring, recommendations (T14).** L&D picks company policies or SOPs (P05) and AI drafts a **course outline, lessons and a quiz** (T01 items) as a **draft** for human review. Employees get **personalised recommendations** from their confirmed skill gaps (M06 YX-PERF-20, career-path and IDP gaps), role and mandatory learning.

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `courses` + `course_items` | Content items (video, doc, SCORM package ref, link, assessment ref), order, required flag |
| `learning_paths` + `learning_path_courses` | — |
| `course_competencies` | course → competency + level gained |
| `sessions` + `session_trainers` | Session details, venue / link, seats, waitlist, cost lines |
| `enrolments` | Status, source, due date, progress %, score, attempts, completion evidence, T03 invitation ref (when an assessment is attached) |
| `session_attendance` | Per day / slot: present / absent / late, method (QR / manual / virtual join log) |
| `scorm_registrations` | SCORM / xAPI runtime state (cmi data) |
| `assignment_rules` | Population rule, course / path, due in N days, recurrence |
| `certifications` | Enrolment, certificate doc (P05), issued, expires, renewed_by |
| `training_needs` | Source, employee / group, competency, priority, status, linked plan |
| `training_budgets` | Department × FY, planned vs spent |
| `training_bonds` | Q5: amount, period, pro-rata rule, linked enrolment |
| `training_feedback` | Reaction survey, effectiveness check (Q8) |
| `external_trainers` | Limited login (Q6) |
| `content_providers` | C2: provider (LinkedIn Learning / Coursera / Udemy Business / partner pack), credentials ref (P10 secrets), licence notes (customer's contract), seat count if known, sync schedule, status |
| `external_course_links` | C2: course ↔ provider course id, deep link (SSO), duration, skills → competency mapping, last synced |
| `provider_learner_links` + `provider_sync_log` | C2: employee ↔ provider learner id (matched by work email); each sync run with counts; **exceptions queue** for unmatched learners or rejected pushes |
| `session_meetings` | C2: session, provider zoom / teams / meet, organiser account, meeting id, join URL, created / updated / cancelled at, participant-report ref |
| `gamification_settings` | C2: company switch, point rules (starter template), badge rules, leaderboard scopes and periods |
| `points_ledger` + `badge_awards` + `leaderboard_optouts` | C2: append-only points per activity; badges awarded with the triggering rule; employee opt-outs |
| `credential_issuances` | B15: certification, format open_badges_3 / credly, credential id / URL, issuer key id, status issued / expired / revoked, revoked reason |
| `lti_platforms` + `lti_deployments` + `lti_resource_links` + `lti_launches` | B15: external LMS registration (issuer, client id, JWKS URL, deployment ids), linked course / assessment, each launch (user, matched employee or guest learner, outcome, grade passed back) |
| `courses` (added fields, T14) | `ai_generated`, `source_document_versions[]` (P05), `review_status`, reviewer |
| `learning_recommendations` (T14) | Employee, course, reason (skill gap / IDP / role / mandatory), skill ref, generated at, status (shown / dismissed / enrolled) |

All tables carry `organization_id` + RLS. Scores are **Confidential**: visible to the employee, their manager chain and L&D. Leaderboards show **points only**, never assessment scores.

## 5. Rules (YX-LRN)

| ID | Rule |
|---|---|
| YX-LRN-01 | Completion requires meeting the course's completion criteria: attendance ≥ the threshold for sessions, all required items for self-paced courses, and a pass score when an assessment is attached (taken from the enrolment's T03 employee invitation result). An absent attendee is never marked completed (fixes MS-D1). |
| YX-LRN-02 | Completing a course with a certificate template issues the certificate automatically as a P05 document with QR verification (fixes MS-D2, U86). |
| YX-LRN-03 | Completion updates the employee's competency profile at the course's mapped level. Evidence is linked (fixes U87). |
| YX-LRN-04 | Assignment rules are evaluated daily and on events (join, transfer, role change). Enrolments carry due dates, with P04 reminders before and escalation to the manager after. |
| YX-LRN-05 | A certification's expiry creates a renewal enrolment N days before (default 30). Expired mandatory certifications show as **non-compliant** on the compliance dashboard. |
| YX-LRN-06 | Session seat limits are enforced, with a first-come waitlist; a withdrawal promotes the next person and notifies them. |
| YX-LRN-07 | Nominations and self-enrolments that need approval (per course / cost setting) go through P03. Cost is checked against the department budget, with a warning or block per company setting. |
| YX-LRN-08 | One session record holds schedule, attendance, results, cost and feedback. There are no separate result or feedback documents (fixes U86). |
| YX-LRN-09 | SCORM 1.2 / 2004 packages run in a sandboxed player. Completion and score come from the package's reported status. |
| YX-LRN-10 | **Content provider connectors (C2; D18).** LinkedIn Learning, Coursera and Udemy Business connect with the **customer's own licence** and credentials (P10 secrets); the connector is included in the price, the **content licence is the customer's contract with the provider**, and licensed partner content packs sold through YukthiX are an add-on (D18 (3)); a connector to another provider built for one customer is a custom-connection add-on (D18 (4)). Catalogue sync creates **external courses** that behave like any course (assignment rules, paths, IDPs, competency mapping). Learners are matched by work email; unmatched records go to an exceptions queue and **never create employees**. A provider-reported completion completes the enrolment (YX-LRN-01 criterion "provider complete") and flows on to certificates (YX-LRN-02) and competencies (YX-LRN-03). Only name, work email and course ids are sent to the provider. |
| YX-LRN-11 | **Live-class auto-creation (C2).** Per course (starter template: on), scheduling a virtual session creates the Zoom / Teams / Meet meeting through the P10 connector on the organiser's connected account (trainer, or L&D when an external trainer has none) and sends calendar invites to enrolled attendees; enrolment changes, reschedules and cancellation update the same meeting. Attendance (Q7) uses the provider's participant report where the connector supports it (join / leave times → slot attendance), otherwise the join-link log, and the trainer confirms before completion. Meeting-platform licences are the customer's. |
| YX-LRN-12 | **Gamification (C2; D17).** Off until the company switches it on; point and badge rules come from a labelled starter template the company edits. Points are append-only in a ledger (reversals as negative entries, e.g. a completion undone). Leaderboards are scoped (team / department / company, per period) and show points only. **Any employee can opt out** of leaderboards at any time (they still see their own points and badges privately). Points and badges **never feed ratings, pay or any M06 decision**. Mandatory compliance courses may earn points but never rank people on compliance status. |
| YX-LRN-13 | **Open Badges 3.0 / Credly (B15).** Per certificate template, a certification can also be issued as a signed **Open Badges 3.0** credential (W3C Verifiable Credential; issuer key per tenant, verify URL on the public verify page) and / or pushed to the company's **Credly** organisation (customer's Credly account and fees). The badge carries the expiry of the certification; renewal issues a new badge; revocation or expiry of the certification revokes / expires the badge. The employee can share the badge (LinkedIn, wallet) and keeps it after exit. |
| YX-LRN-14 | **LTI 1.3 tool (B15).** YukthiX is an **LTI 1.3 / LTI Advantage tool** (Deep Linking to pick a course or assessment, Assignment and Grade Services for grade passback, Names and Role Provisioning optional). An admin registers each external LMS (issuer, client id, JWKS, deployment ids). A launch signs in the user by the platform's verified claims: matched to an employee by email / employee code, otherwise a **guest learner** limited to the launched item (P02 §4.7 style scope). Proctored assessments keep their proctoring (T04). Launches are metered like the product used: employee learning is covered by the HRMS price, a non-employee's test attempt counts as a Proctoring attempt (D18). |
| YX-LRN-15 | **AI authoring and recommendations (T14).** AI-drafted courses and quizzes are drafts labelled "AI-generated", built only from the selected company documents (treated as untrusted input, P10 YX-AI-05), with a source citation per lesson and question; publishing needs a named reviewer, and the source document version is kept so an updated policy flags the course for review. Recommendations use confirmed skills only, show the reason (e.g. "gap in *Negotiation* for your next role"), never enrol anyone automatically (mandatory learning stays under the assignment rules) and never use Special data or ratings. AI runs use AI credits (D18). |

## 6. Flows
1. **Compliance:** HR creates assignment rules → employees are auto-enrolled → reminders → completion → certificate → renewal. The compliance dashboard shows completion % by entity, location and department, and lists who is overdue.
2. **Catalogue and enrolment:** browse → enrol (self) or nominate (manager / HR) → approval if needed → seat or waitlist → attend or learn → assessment (T03 employee invitation, created at enrolment and opened from the Me tab) → result back to the enrolment → certificate.
3. **Training needs to plan:** needs are collected from reviews and gaps (M06), manager requests and rules → L&D groups them into a plan (courses and sessions, budget) → enrolments are created.
4. **External training request:** employee requests a paid external course or certification → approval with cost → optional training bond (Q5) → completion proof uploaded → reimbursement via M05 or direct company payment.
5. **Effectiveness:** feedback after the session → manager check after N days (Q8) → reports.
6. **Provider content (C2):** L&D connects a provider with the company's licence → catalogue syncs as external courses → assigned or self-enrolled like any course → learner opens the deep link (SSO) → progress / completion synced daily (and by webhook where offered) → enrolment completes → certificate and competency update; unmatched learners go to the exceptions queue (YX-LRN-10).
7. **Live class (C2):** L&D schedules a virtual session → meeting created on the organiser's account and invites sent → changes keep the meeting in sync → after the class, the participant report fills attendance → trainer confirms (YX-LRN-11).
8. **Badge (B15):** certification issued (YX-LRN-02) → Open Badge signed and / or Credly badge pushed → employee shares it → expiry or revocation follows the certification (YX-LRN-13).
9. **LTI launch (B15):** admin registers the external LMS → LMS course designer deep-links a YukthiX course or assessment → learner launches → identity matched or guest learner created → learns / takes the test → grade passed back to the LMS (YX-LRN-14).

**Events emitted:** `learning.enrolment.completed`, `learning.certification.expiring` / `.expired`, `learning.need.created`, `learning.badge.issued` / `.revoked` (B15), `learning.provider.sync_failed` (C2, → L&D admin).

**Events consumed:** `perf.idp.approved` (M06 YX-PERF-14 → enrolment requests for course items).

## 7. UI
- **My learning (mobile first):**
  - assigned courses with due dates;
  - a continue-learning card;
  - certificates;
  - catalogue.
- **Session page (T3 detail):**
  - tabs for Attendees, Attendance, Results, Feedback and Cost;
  - a QR attendance screen for the trainer.
- **Compliance dashboard (T6):** a heatmap of department × mandatory course.
- **Team skills matrix:** people × competencies, with gaps highlighted (U87 target).
- **Course builder:** content items, assessment picker (from the question bank), certificate template, and competency mapping; per template, "also issue as Open Badge / Credly" (B15).
- **Marketplace (C2):** one catalogue with filters by source (own / provider / partner pack), skill and duration; provider courses marked with the provider's name.
- **Integrations (admin, C2 / B15):** content providers with sync status and the exceptions queue; LTI platforms with registration details and launch log.
- **Achievements (C2):** my points, badges and the leaderboard (with an "opt out of leaderboards" toggle); shown only when the company switch is on.
- **Session page (C2):** "meeting created on Zoom / Teams / Meet" with the join link and the imported participant report on the Attendance tab.

## 8. Migration & rollout
- Import past training records and certificates, including expiry dates, so renewals work from day one.
- Ship mandatory-course templates: POSH awareness (content partner or company's own), fire safety, code of conduct, information security.
- SCORM player ships in wave 5 (Q1). xAPI follows in wave 6.
- **Gap-register extension (26 Sep 2026), all in launch scope; waves are build order:** wave 5 — live-class auto-creation (C2; calendar connectors exist), Open Badges 3.0 issuing (B15); wave 6 — provider connectors and marketplace, gamification (C2), Credly push and the LTI 1.3 tool (B15, alongside xAPI). All included in the per-user price (D18); provider licences, meeting-platform licences and Credly fees are the customer's own contracts, and partner content packs are an add-on.
- Ship a labelled starter template of point and badge rules (e.g. first course, 5 courses, on-time streak, path completed).

## 9. Acceptance tests (samples)
- An absent attendee remains "No-show" after results are entered (MS-D1).
- Completing a "has certificate" course issues a PDF with a QR code that verifies on the public page (MS-D2).
- Completion of "Advanced Excel" raises Excel from level 2 to level 3 on the skills profile (U87).
- A new joiner is auto-enrolled in POSH awareness due in 30 days; on day 31 the manager gets an escalation (YX-LRN-04).
- A fire-safety certificate expiring on 1 Nov creates a renewal enrolment on 2 Oct (YX-LRN-05).
- A session with 20 seats puts the 21st enrolment on the waitlist; when someone withdraws, the waitlisted person is promoted and notified.
- A Coursera completion synced for neha@acme.com completes her assigned "Data Literacy" enrolment and issues its certificate; a Coursera learner with a personal email lands in the exceptions queue and no employee is created (YX-LRN-10).
- Rescheduling a Teams live class from 3 pm to 4 pm updates the same meeting and every attendee's invite; the participant report marks an attendee who joined for 10 of 60 minutes as absent for that slot (YX-LRN-11).
- Ravi opts out of leaderboards: he disappears from the department board but still sees his own 120 points and badges (YX-LRN-12).
- A fire-safety certificate issued as an Open Badge verifies on the public page; when the certification expires, the badge shows "expired" (YX-LRN-13).
- A Moodle course launches a YukthiX assessment through LTI 1.3; an employee is matched by email and the score is passed back to the Moodle gradebook (YX-LRN-14).
- T14: from the leave-policy PDF, AI drafts a 3-lesson course and a 10-question quiz with citations; it can't be published without a reviewer, and a new policy version flags it for review; an employee with a confirmed gap in *Excel* sees the course recommended with its reason and isn't enrolled until she chooses to (YX-LRN-15).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | What learning content at launch? | **Sessions (classroom / virtual) + self-paced courses** (video, PDF, link, quiz from the assessment engine) **+ SCORM 1.2 / 2004 player** (open-source MIT runtime); **xAPI in wave 6**. No content authoring tool beyond the course builder. |
| Q2 | Enrolment methods | **All:** self-enrol (approval per course setting), manager / HR nomination, auto-assignment rules; seats + waitlist; employee can decline a nomination with reason (manager sees). |
| Q3 | Mandatory / compliance training | **Assignment rules** by population (entity, location, department, designation, joiner, role change) with due dates, recurrence (e.g. yearly), reminders → manager escalation; certification expiry auto-renewal; compliance dashboard. |
| Q4 | Training needs analysis | **Automatic + manual:** needs from M06 skill gaps and review recommendations, manager requests, compliance gaps; L&D reviews and plans them into courses / sessions; employees can request training too. |
| Q5 | Training cost, budget and bonds | Cost per session / course / external request; **department budget per FY** (warn by default, block optional); **training bond** (service agreement) optional per course above a cost: pro-rata recovery if the employee leaves within the period, added to F&F with HR confirmation. |
| Q6 | External trainers | **Limited trainer login** (email OTP): see their sessions, mark attendance, enter results; no access to other employee data. HR can also mark on their behalf. |
| Q7 | Session attendance | **QR check-in** shown by the trainer (employee scans in app) + manual marking; virtual sessions: join log (Teams / Meet / Zoom link clicks) + trainer confirmation; completion threshold default 75 % of slots. |
| Q8 | Measuring training effectiveness | **Two levels at launch:** reaction survey right after (rating + comments, trainer score) and a **manager check after 60 days** ("applying the skill?"); optional pre/post test comparison via the assessment engine. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Launch content:** sessions (classroom / virtual), self-paced courses (video, PDF, link, quiz via assessment engine) and a **SCORM 1.2 / 2004 player** (open-source MIT runtime; licence verified before use); **xAPI in wave 6**; course builder only, no authoring tool. | 25 Sep 2026 |
| Q2 | **All enrolment methods:** self-enrol (approval per course setting), manager / HR nomination, auto-assignment rules; seat limits + waitlist; employee may decline a nomination with a reason (manager sees; mandatory courses cannot be declined). | 25 Sep 2026 |
| Q3 | **Assignment rules** by population (entity / location / department / designation / joiner / role change) with due dates and recurrence; P04 reminders → manager escalation → HR; certification expiry auto-renewal (YX-LRN-05); compliance dashboard with overdue lists and exports for audits. | 25 Sep 2026 |
| Q4 | **Training needs automatic + manual:** from M06 skill gaps and review recommendations, compliance gaps, manager and employee requests; L&D reviews, groups and plans them into courses / sessions with budget; need status tracked to closure (enrolment completed). | 25 Sep 2026 |
| Q5 | **Cost tracking** per session / course / external request; **department budget per FY** (warn by default, hard block optional); **optional training bond** per course above a cost threshold: employee accepts bond terms (P05 click-to-accept) before enrolment; leaving within the period → pro-rata recovery added to F&F **after HR confirmation** (enforceability varies; HR can waive with reason). | 25 Sep 2026 |
| Q6 | **Limited external-trainer login** (email OTP; P02 "External trainer" role template): only their own sessions — attendee names, attendance, results, session feedback summary; no other employee data; not a billed seat; access ends N days after the session's last date. HR can mark on their behalf. | 25 Sep 2026 |
| Q7 | **Session attendance:** rotating QR shown by the trainer (scanned in the app; kiosk / code fallback for staff without phones, M04 Q4) + manual marking; virtual sessions: join-link log + trainer confirmation; completion threshold default **75 %** of slots (per course). | 25 Sep 2026 |
| Q8 | **Effectiveness at launch:** reaction survey right after (rating, comments, trainer score) + **manager check after 60 days** ("applying the skill?", configurable delay); optional pre / post test comparison via the assessment engine; trainer and course scores in P09. Business-impact (KPI) linking deferred. | 25 Sep 2026 |
| D2 | **Consistency fix — employee assessments:** an enrolment in a course with an assessment automatically creates a T03 employee test invitation (test-taker = employee, YX-DLV-13); the attempt result and certificate flow back to the enrolment, and YX-LRN-01 uses that result for the pass criterion. | 26 Sep 2026 |
| C2 | Gap-register extension (user decision 26 Sep 2026): **content marketplace and connectors, live classes, gamification.** LinkedIn Learning / Coursera / Udemy Business connectors on the **customer's own licence** (connector included, content cost the customer's; partner content packs and one-off custom connectors are add-ons, D18); catalogue as external courses; enrolment push and completion sync; email matching with an exceptions queue, never creating employees (YX-LRN-10). **Live-class auto-creation** of Zoom / Teams / Meet meetings through P10 calendar connectors, kept in sync, participant report → attendance with trainer confirmation (YX-LRN-11). **Gamification** behind a company switch with a labelled starter template, append-only points, badges, scoped leaderboards showing points only, **individual opt-out**, never feeding ratings or pay (YX-LRN-12). Waves 5 (live class) and 6 (connectors, marketplace, gamification). | 26 Sep 2026 |
| B15 (part) | Gap-register extension (user decision 26 Sep 2026): **Open Badges 3.0 / Credly and LTI 1.3.** Certifications optionally issued as signed Open Badges 3.0 credentials and / or via the company's Credly account; badge expiry and revocation follow the certification (YX-LRN-13). **LTI 1.3 / Advantage tool** (Deep Linking, grade passback, optional roster) so external LMSs launch YukthiX courses and assessments; employee match or scoped guest learner; proctoring kept; metered as the product used (YX-LRN-14). Equating and cut-score studies stay in T02 / T05. Waves 5 (Open Badges) and 6 (Credly, LTI). | 26 Sep 2026 |
| T14 | **Validation pass 3 Should (T14), founder decision 28 Sep 2026:** **AI course and quiz authoring** from company policies and SOPs (drafts, citations, named reviewer, re-review when the source changes) and **personalised recommendations** from confirmed skill gaps, IDP, role and mandatory learning, with reasons and no auto-enrolment; AI credits (YX-LRN-15). EU AI Act row in P10 §A4. Wave 5. | 28 Sep 2026 |
