# YukthiX Assessments: designs and what exists (audit)

This file checks, story by story, every design under `Screens/Proctoring/` (36 story files) and the Settings page 6.5
Assessments against what is live, in the same shape as `projects-design-map.md`. It also maps the older exam product
that YukthiX grew from, says what can be reused, and checks the older routes for security, as Settings S-10 did for the
integration routes. Founder rules: never build a second, simpler version of a designed screen (make the designed one
live); every policy choice is a company setting with a default; build only from the design kit.

Founder direction (decision 1335, 13 Nov 2026): assessments stay. Hiring assessments inside Hire come first (a company
tests its own job candidates: aptitude, skills, coding, light proctoring). The exam engine is built so it can later
serve certification exams in the style of Pearson VUE (exam owners, paid booking, test centres or online live
proctoring, ID checks, secure item banks, results and certificates). Certification starts only with a real customer.

Status 13 Nov 2026 (branch `docs/yukthix-assessments-map`, from `test/yukthix-main` at 7919797a2). Audit only: nothing
was built. Every verdict below names its evidence (a file, a route, a model field or a search with no hits).

## What is live today (plain English)

- **No designed assessment screen is live.** No page under `apps/web` imports any of the 45 screens in
  `packages/yx-ui/src/screens/proctoring/*.tsx` (search below). 44 of them are on the `notLive` list of
  `packages/yx-ui/src/design-live-guard.known.json` (lines 177 to 222, `proctoring: …`). The 45th,
  `LiveConsoleScreen`, is missing from that list only because its story title "PRC-13 · Live console" contains the word
  "Live", and the guard treats any title with "Live" as a picture of the live app (`design-live-guard.test.ts`,
  `const copy = /\bLive\b/.test(title)`). It is not live either (question 2020).
- **But the older exam product is live and does a lot of the job, on older screens.** It is a complete online test
  product: a question bank, a test builder, invitations, walk-in drives, a candidate test runner in its own service,
  AI and webcam proctoring, live monitoring, marking, results, certificates and item statistics. It runs on:
  - the API modules `apps/api/src/questions`, `exams`, `invitations`, `drives`, `walk-in`, `walk-in-groups`,
    `attempts-admin`, `result-release`, `certificates`, `analytics/item-analytics*`, `reports` (results),
    `face-enrolment` and `proctoring-retention`;
  - the candidate service `apps/exam-runtime` (its own app: candidate sign-in from the invitation token, attempts,
    answers, code runs on Piston, grading, face checks, integrity analysis, AI webcam and screen analysis, live
    monitoring over a socket, leaderboard), which the API calls through `apps/api/src/exam-runtime-client`;
  - the staff pages under `apps/web/app/v2/(recruiter)`: `/v2/questions` (list, new, edit, bulk upload, AI generate),
    `/v2/exams` (list, new, edit with tabs: details, sections, candidates, live monitoring, grading queue, results,
    leaderboard; preview), `/v2/reports` and `/v2/panel/reports` (per test, per candidate, compare),
    `/v2/walk-in-groups`, `/v2/drives/[driveId]`, `/v2/today`, and `/v2/settings/certificate`;
  - the candidate pages `apps/web/app/(candidate)`: `/welcome` (practice question, consent, camera, screen share, Safe
    Exam Browser, face enrolment), `/start`, `/exam` (the runner), `/submitted`, `/session-ended`; the public walk-in
    page `/walk-in/[orgSlug]` and certificate check `/verify`.
- **Hire already uses tests.** A job links tests (`job_exams`); a test can be sent automatically when an application
  enters a stage (`job_exams.send_on_stage_id`, `interviewing/hiring-board.service.ts` line 91), and recruiters send a
  test to many candidates at once from the candidates list (`POST hiring/entries/bulk`, action `assessment`, line 172).
  The candidate careers portal shows an "Assessment" step in My applications (`hiring-design-map.md` line 608).
- **Who reaches the older screens today.** Hire's menu has "Assessments & more (older screens)" to `/v2/today` for
  holders of `exam:manage` or `question_bank:manage`, and "Test results (older screens)" to `/v2/panel/reports` for
  holders of `results:view` without those (`apps/web/lib/yx-nav.ts` lines 429 and 430). No YukthiX role template grants
  `exam:manage` or `question_bank:*` (`apps/api/src/access/role-templates.ts` lines 171 to 195 list only `ats.*` keys),
  so only users on the older built-in `recruiter` role (`apps/api/prisma/seed.ts` line 252) or a permission profile
  can write questions and tests. Results are read much more widely (see the security check).
- **Company isolation is only half in the database.** The tables that carry `organization_id` have forced row-level
  security (questions, tags, exams, walk-in groups, drive sessions, certificate templates, job tests). The tables that
  hold the candidate's own data do not: invitations, attempts, answers, proctoring events, face enrolments (an
  encrypted face template), proctoring analyses and AI insights have no `organization_id`, so the database does not keep
  one company out of another's rows there; the API code does (details below).
- **Settings 6.5 Assessments is not built.** The registry has the page (`registry-g5-g6.ts` line 1229, key
  `assessments.settings.manage`, 30 settings in five sections), but no API reads or writes any `asmt.*` setting or the
  `assessments.settings.manage` key (`grep -rn "asmt\.|assessments.settings.manage" apps/api/src packages/shared/src`:
  no hits). The older product keeps every choice per test on the `exams` row instead, and fixes retention at 90 days in
  code (`proctoring-retention.service.ts` line 8, `face-retention.service.ts` line 6).

So: of 210 stories (208 Proctoring and 2 for Settings 6.5), none is live with its design; 50 are "live (gap)" (an older
page does part of the job), 21 are "wire design" (the older API already holds what the story shows), 124 are "design
only, feature not built" and 15 are phone views. Split by the founder's buckets: **A** hiring, now: 25; **B** engine,
both: 140; **C** certification only, parked: 45.

Verdicts (the same words as the other maps): **live** · **live (gap)** (an older page or service does part of the job;
the note names it and the gap) · **wire design** (the older API already holds what the story shows; the designed screen
is not wired to it) · **design only, feature not built** · **phone view, mobile app not built**. A screen's empty,
loading and error stories take the screen's verdict.

Buckets: **A** hiring assessments inside Hire, needed now · **B** engine pieces both hiring and certification need ·
**C** certification only (Pearson VUE style), parked until a customer.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories | A | B | C |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Bank and tests (PRC-01 to PRC-06) | 6 | 0 | 10 | 12 | 18 | 0 | 40 | 5 | 32 | 3 |
| 2. Delivery and drives (PRC-07 to PRC-11, PRC-29, PRC-30) | 7 | 0 | 6 | 5 | 22 | 5 | 38 | 13 | 10 | 15 |
| 3. Proctoring and live (PRC-12 to PRC-15) | 4 | 0 | 10 | 0 | 10 | 0 | 20 | 0 | 12 | 8 |
| 4. Integrity and marking (PRC-16 to PRC-20) | 5 | 0 | 11 | 0 | 19 | 0 | 30 | 0 | 29 | 1 |
| 5. Candidate (PRC-21 to PRC-28, PRC-31, PRC-32) | 10 | 0 | 13 | 4 | 32 | 10 | 59 | 7 | 42 | 10 |
| 6. Extras and kit | 4 | 0 | 0 | 0 | 21 | 0 | 21 | 0 | 13 | 8 |
| 7. Settings 6.5 | 1 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 2 | 0 |
| **All 1-7** | **37** | **0** | **50** | **21** | **124** | **15** | **210** | **25** | **140** | **45** |

Counted by script on 13 Nov 2026 on `docs/yukthix-assessments-map` (the script is in the appendix; it prints "ok").
There are 208 stories in 36 files whose title starts `Screens/Proctoring/`, all in
`packages/yx-ui/src/screens/proctoring/stories/` (`prc-01` to `prc-32`, `kit`, `extra-fairness`, `extra-id-review`,
`extra-test-centres`); the same folder also holds the Analytics stories (`Screens/Analytics/…`), which belong to the
Analytics map. The screens are in `bank-tests.tsx`, `delivery.tsx`, `live.tsx`, `integrity.tsx`, `candidate.tsx` and
`proctoring-kit.tsx`. Settings 6.5 is two stories in `screens/settings/settings-g6.stories.tsx` (`P6_5`,
`P6_5_ReadOnly`).

## 1. The older exam product: what exists, who reaches it, and reuse

### 1.1 Pieces, with evidence

| piece | where | what it does today | reuse |
|---|---|---|---|
| Question bank | `apps/api/src/questions` (`/questions`, `/tags`), `questions.service.ts`, `bulk-upload-parser.ts` | 7 types (`single_mcq`, `multi_mcq`, `true_false`, `code`, `essay`, `file_upload`, `spoken`; `question-validation.ts` line 18), marks, negative marks, partial credit, topic, difficulty, tags, image, code tests and starter code; statuses draft, active, archived; Excel bulk upload; publish, archive | **Reuse** (engine B). Missing: versions, review, duplicate check, alt text, translations, exposure cap |
| AI question drafts | `POST /questions/ai-generate` → `jobs/processors/ai-question-generation.processor.ts` (line 120: `status: 'draft'`, `aiGenerated: true`); `ai/question-ai.controller.ts` (`tags`, `distractors`) | drafts a batch on a queue, always as drafts | **Reuse** |
| Item statistics | `apps/api/src/analytics/item-analytics*` (`/analytics/questions/:id`, `/flagged`, `/difficulty-calibration`), `packages/shared/src/analytics/item-statistics.ts` (`MIN_RESPONSES = 20`) | p-value, discrimination, distractor flags, declared vs observed difficulty | **Reuse** |
| Test builder | `apps/api/src/exams` (`/exams`, sections, pool preview, duplicate, publish) | sections with fixed questions or a pool by tags and difficulty (`ExamSection.selectionMode`, `poolSize`, `poolDifficulty`, `weightPercent`, `requiredCount`); publish refuses with no sections, weights not 100 %, a short pool or uneven marks (`exams.service.ts` lines 637 to 700) | **Reuse** |
| Per-test settings | `Exam` model (`schema.prisma` line 699) | duration, pass %, shuffle, feedback visibility, release mode, certificates, window, IP range, anti-cheating, webcam, AI webcam analysis, record only, enforcement and strike limit, switched-off signals, screen capture, lockdown (Safe Exam Browser), face check, enrolment policy, face mismatch action | **Reuse**; the 6.5 company defaults sit on top |
| Invitations | `apps/api/src/invitations` (`/exams/:examId/invitations`, resend, revoke, accommodation, bulk upload and invite) | one invitation per candidate and test, single-use token, email status, extra time % (`Invitation.extraTimePercent`) | **Reuse** (A) |
| Walk-in drives | `apps/api/src/walk-in` (public `/public/walk-in/:orgSlug/exams|register`, own rate limit), `walk-in-groups`, `drives` (`drive_sessions` with time windows, live roster, results) | public sign-up to listed tests, drives with sessions, live board and results | **Reuse** (A) |
| Test runner | `apps/exam-runtime/src/attempts` (`/attempt/start`, `answer`, `answer-file`, `submit`, `run-code`, `proctoring-event`, `webcam-snapshot`, `face-enrolment`, `screen-share-state`, `seb-config`, `certificate`, `leaderboard`), `candidate-auth` (redeem, refresh, logout); web `(candidate)/exam/page.tsx` | sections, question navigator, mark for review, timer with paused time credited (`pausedDurationMs`), code runs on Piston, spoken and file answers, pauses on screen-share loss | **Reuse** the service; the designed runner replaces the page |
| Proctoring | `exam-runtime/src/face`, `proctoring-analysis`, `integrity`, `attempts/proctoring-severity.ts` | face enrolment and in-test face match with a voter, AI webcam and screen analysis, integrity level (low, medium, high) with an AI narrative, code similarity between candidates of the same question (`integrity/similarity.ts`, 5-gram Jaccard); AI flags never auto-punish | **Reuse** |
| Live monitoring | `exam-runtime/src/monitoring` (socket gateway), `attempts-admin` (`proctoring-events`, `message`, `unblock`, `force-submit`, `proctoring-bypass`); web `LiveMonitoringPanel.tsx` | roster by status, time left, integrity level, snapshots, events, chat, unblock, end attempt | **Reuse** |
| Marking | `attempts-admin` (`answers/:qid/grade`, `finalize-manual-grade`, AI `code-review`), `exams/:id/pending-grading`; web `GradingQueuePanel.tsx` | manual marks for essay, file, spoken and code; AI code review | **Reuse** |
| Results | `reports` (`/reports/:id/results/summary`, `question-accuracy`, `candidates/:cid/report`, `compare`, `export`), `result-release` (release per test or attempt, hold), `attempts-admin` AI insight | summary, per-candidate report, compare, CSV, release and hold, email the outcome | **Reuse** |
| Certificates | `certificates` (`/certificate-template`, `attempts/:id/certificate`, public `/public/certificates/:id/verify`); web `/v2/settings/certificate`, `/verify` | a pass certificate PDF and a public check that shows only what is printed | **Reuse** (B; certification grows it) |
| Retention | `proctoring-retention.service.ts`, `face-retention.service.ts` (nightly) | deletes snapshots, screen captures and face images 90 days after the attempt | **Reuse**, with the 6.5 setting in place of the fixed 90 |
| Test helpers | `apps/api/src/testing/e2e-database.ts`; e2e `apps/api/test/exam-*.e2e-spec.ts`, `question-bank`, `candidates-invitations`, `webcam-proctoring`, `ai-proctoring`, `ai-question-generation`; `apps/exam-runtime/test/integrity.e2e-spec.ts` | the e2e database and suites; four suites test another company (`orgB`) | **Reuse** |

Missing everywhere (searches in `apps/api/src` and `apps/exam-runtime/src`, 13 Nov 2026, no hits): adaptive or IRT
(`adaptive|theta|\birt\b`), appeals (`appeal`), blind marking (`blind`), calculator, liveness, ID card or government ID,
room scan, admit card, institution or college, slot booking or rescheduling (`reschedul`), translations, alt text,
exposure cap, legal hold, practice test outside `/welcome`, companion phone, collusion report. Answers kept on the
device during a drop: `localStorage|offline|reconnect` in `(candidate)/exam/page.tsx`: none.

### 1.2 Who can reach what today

| who | how | what |
|---|---|---|
| Older built-in `recruiter` role, or a permission profile with `exam:manage` / `question_bank:manage` | Hire › "Assessments & more (older screens)" → `/v2/today` | write questions and tests, invite, drives and walk-in groups, live monitoring, end or unblock an attempt, marking, release results, certificate template |
| Holders of `results:view`, directly or through an alias (older `hiring_manager`, `auditor`; YukthiX holders of `ats.candidate.view`, `ats.candidate.manage` or `ats.assessment.view`: the Recruiter, Hiring manager and Interview coordinator templates) | API; Hire › "Test results (older screens)" → `/v2/panel/reports` (I did not check whether the menu's `has()` follows the alias) | read every test (with answer keys), every result, every candidate report, compare and export, drive results; regenerate an AI insight |
| Recruiters with `pipeline:manage` | Hire job workspace and candidates list | link tests to a job, auto-send on a stage, bulk send a test |
| A candidate | the invitation link (`/welcome` → `/start` → `/exam` → `/submitted`), a candidate token from `candidate-auth/redeem` | take one test; see their own outcome and certificate as the test allows |
| Anyone | `/walk-in/[orgSlug]` (own rate limit), `/verify` | sign up to a listed walk-in test; check a certificate |

### 1.3 Security check of the older routes (as Settings S-10)

Checked 13 Nov 2026 in code only (no database was opened; RLS read from the migrations). Key = the permission each
route checks; "older" = a /v2-era key, not a YukthiX `area.thing.action` key.

| routes | key | older or YukthiX | MFA / step-up | not while acting | isolation | finding |
|---|---|---|---|---|---|---|
| `POST|PATCH|DELETE /exams…`, sections, publish, duplicate, walk-in flags | `exam:manage` | older | MFA (the key is in `SENSITIVE_ROLE_PERMISSIONS`, `packages/shared/src/auth/mfa.ts` line 140); no step-up | **no** | `exams` forced RLS; children by the exam's company in code | changes allowed while impersonating (no `OwnSessionGuard` or `ownSession` in any exam module) |
| `GET /exams`, `/exams/:id`, `/section-titles` | `exam:manage` or `results:view` | older | no | n/a | as above | **answer keys to readers:** `findOne` returns every question with its options and `isCorrect` (`exams.service.ts` lines 397 to 406), so a hiring manager or interview coordinator reads the answer key of every test |
| `GET /questions…` | `question_bank:manage` or `question_bank:view` | older | no | n/a | `questions` forced RLS; `question_options` has none (no company column), reached only through its question | auditor reads answer keys (by design for audit) |
| `POST|PATCH /questions…`, bulk upload, images, AI generate | `question_bank:manage` | older | no | **no** | as above | AI generate is a paid call; throttled (`STRICT_AI_GENERATE_THROTTLE`) |
| `GET /reports/:id/…` (summary, accuracy, candidate report, compare, export), `GET /drives/:id`, `/live`, `/results`, `GET /attempts/:id/ai-insight` | `results:view` | older | no | n/a | the exam's company in code; `attempts`, `answers`, `attempt_insights` have no RLS | **too wide:** `LEGACY_ALIASES['results:view']` includes `ats.candidate.view` (`packages/shared/src/rbac/ats-keys.ts` line 35), and the Interview coordinator template holds it while its own text says it "cannot … see assessment results" (`role-templates.ts` lines 190 to 195). Results are not limited to the reader's own jobs: no record scoping in `reports`, `exams` or `drives` services (`grep -lniE "record.?visib|hiringManager|governed"`: none) |
| `POST /attempts/:id/ai-insight/regenerate` | `results:view` | older | no | **no** | as above | a read key starts a paid AI call |
| `POST /attempts/:id/force-submit`, `unblock`, `proctoring-bypass` (+ revoke), `answers/:qid/grade`, `finalize-manual-grade` | `exam:manage` + `@SensitiveRoleAction` | older | MFA enrolment only (`auth/step-up.decorator.ts`: AAL2 session, not a fresh step-up) | **no** | `attemptOwnershipWhere` (`attempts-admin.service.ts` lines 302 to 310: `invitation.exam.organizationId`) | ending an attempt takes **no reason** (`force-submit` has no body); no step-up for ending, grading or bypass |
| `POST /exams/:examId/results/release`, `attempts/:id/results/release|hold` | `exam:manage` | older | no | **no** | exam checked first; attempts by `examId` | releasing results is not a step-up action |
| `POST /exams/:examId/invitations`, bulk invite, resend, revoke, accommodation | `candidate:manage` | older (aliased to `ats.candidate.manage`) | no | **no** | `invitations` has no RLS; checked through `exam.organizationId` (`invitations.service.ts` lines 357, 399, 424) | |
| `GET|PUT /certificate-template`, `GET /attempts/:id/certificate` | `exam:manage` | older | no | **no** | `certificate_templates` forced RLS | |
| `GET /public/certificates/:id/verify` | none (public) | n/a | n/a | n/a | looks up a result id across all companies (`certificate.service.ts`) | by design: returns only what is printed; ids are UUIDs. Keep |
| `/public/walk-in/:orgSlug/exams|register` | none (public) | n/a | n/a | n/a | org by slug; `WalkInThrottlerGuard` plus the app-wide limit | a known candidate's details are never overwritten except the narrow name expansion rule (`walk-in.service.ts`). Keep |
| exam-runtime `/attempt/*`, `/candidate-auth/*` | candidate token from the invitation | n/a | n/a | n/a | the attempt of the token's invitation | not re-checked in depth here |
| nightly retention sweeps | system | n/a | n/a | n/a | run as super-admin because `proctoring_events` has no company column | fixed 90 days, not a company setting |

**Fixed 13 Nov 2026 (security hotfix, branch fix/exam-answer-key-exposure).** (1) Answer keys (correct options, model answers, code test cases) go only to people who write tests or questions (`exam:manage` or `question_bank:manage`, never while acting): `GET /exams/:id`, `GET /questions` and `/questions/:id`, and the candidate report (`correctOptionIds` empty) strip them for everyone else; the candidate's own right or wrong stays. (2) `results:view` no longer stands in for `ats.candidate.view`: an Interview coordinator reads no tests or results; that also closes the older routes on that key (the /hiring job board, pipeline, candidate profile, feedback, teammates and user groups), which carry test results. Hiring managers keep company-wide results through `ats.assessment.view` (own-job scoping is still open, 2004). (3) `POST /attempts/:id/ai-insight/regenerate` needs `exam:manage`. Tests: `test/exam-answer-keys.e2e-spec.ts`.

**Database isolation (RLS).** `20261005000001_tenant_rls/migration.sql` forces RLS with the company policy on every
table that has `organization_id`: `questions`, `tags`, `exams`, `walk_in_groups`, `drive_sessions`,
`certificate_templates`, `job_exams`. These have **no** `organization_id` and so **no RLS** (checked per model in
`schema.prisma`): `question_options`, `exam_sections`, `exam_section_questions`, `exam_section_pool_tags`,
`invitations`, `attempts`, `answers`, `proctoring_events`, `face_enrolments`, `proctoring_analyses`, `attempt_insights`.
The code says so itself: "answers carry no organization_id, so row-level security does not scope the lookup below"
(`attempts-admin.service.ts` line 246). Isolation there rests on each query joining up to the exam's company, which
the four cross-company e2e suites test. For candidate answers, webcam evidence and face templates this is below the
YukthiX bar (every other area keeps company data in forced RLS), so slice AS-0 adds the column and the policy first.

**Older keys.** Every route above uses an older key. Settings S-10 replaced nothing for these; question 2003 proposes
YukthiX keys with the older ones kept as aliases (the same pattern as `ats-keys.ts`).

## 2. Searches run for "not built" (13 Nov 2026, on `test/yukthix-main` at 7919797a2)

- Kit screens in the web app: `grep -rlE "<all 45 proctoring screen names>" apps/web`: **no hits**.
- Guard: `grep -c '"proctoring: ' design-live-guard.known.json`: 45 entries (44 screens and `ProctorTile`);
  `LiveConsoleScreen` missing for the reason above.
- Web routes: `find apps/web/app/yx -name page.tsx | grep -iE "assess|exam|test|proctor|question"`: none.
- Settings 6.5: no `asmt.` key and no `assessments.settings.manage` in `apps/api/src` or `packages/shared/src`.
- Feature words: see the end of section 1.1.

## 3. Design groups, story by story

### 1. Bank and tests (PRC-01 to PRC-06)

#### PRC-01 · Question bank

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Default | wire design | B | `GET /questions` (topic, difficulty, status, tag, search, pages); today `/v2/questions` |
| BulkSelected · Bulk actions | wire design | B | `/v2/questions` bulk bar publishes or discards the ticked questions through the per-question `publish` and `archive` routes |
| RowOpen · Question drawer with item stats | wire design | B | `GET /analytics/questions/:id` (p-value, discrimination, distractors; from 20 answers) |
| LibraryPacks · Library packs | design only, feature not built | A | no pack or shared library model (`grep -rniE "\bpacks?\b" questions/ schema.prisma`: none for questions); starter packs are content work too (question 2017) |
| Empty · Empty | wire design | B | as Default |
| Loading · Loading | wire design | B | as Default |
| Error · Error | wire design | B | as Default |

#### PRC-02 · Question editor

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Default | wire design | B | `POST|PATCH /questions` with the 7 types; today `/v2/questions/new` and `/[id]/edit` |
| MajorEdit · Major edit creates a new version | design only, feature not built | B | no versions; only `Question.answerKeyChangedAt` is stamped |
| DuplicateBlocked · Duplicate blocks approval | design only, feature not built | B | no duplicate check on questions (`integrity/similarity.ts` compares candidates' code, not questions) |
| MissingAltText · Missing alt text blocks approval | design only, feature not built | B | `Question.imageUrl` has no alt text field |
| AiDraft · AI-drafted question | wire design | B | AI questions land as drafts with `aiGenerated` (processor line 120); AI tags and distractors exist |
| MobilePreviewTamil · Mobile preview, untranslated language | design only, feature not built | B | no translations (`translation` in exam code: none) |
| HindiPreview · Hindi preview | design only, feature not built | B | as above |
| Versions · Versions | design only, feature not built | B | no versions |
| ItemStats · Item stats | wire design | B | `GET /analytics/questions/:id` |
| Translations · Translations | design only, feature not built | B | no translations |

#### PRC-03 · Question review queue

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Version diff with field comments | design only, feature not built | B | statuses are only draft, active, archived; the author publishes (`POST /questions/:id/publish`); no review, no versions |
| Duplicate · Near-duplicate must be confirmed | design only, feature not built | B | no duplicate check |
| Approved · Approved | design only, feature not built | B | no review |
| ChangesRequested · Changes requested | design only, feature not built | B | no review |
| Empty · Empty | design only, feature not built | B | as Default |
| Loading · Loading | design only, feature not built | B | as Default |

#### PRC-04 · Test builder

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Blueprint · Blueprint grid | live (gap) | B | `/v2/exams/[id]/edit` sections tab (`ExamSectionsPanel`): fixed or pool sections by tags and difficulty, weights, required count. Gap: the skill-by-difficulty grid |
| BelowPoolDepth · Blueprint below pool depth | wire design | B | publish refuses a pool with fewer matching questions (`exams.service.ts` lines 683 to 696); `GET …/pool-preview` |
| Template · Template library | live (gap) | A | `POST /exams/:id/duplicate` copies a test. Gap: no template library |
| BuildFromJd · Build from job description | design only, feature not built | A | `POST ai/job-description` drafts the job description itself (`ai-drafting.controller.ts` line 20), not a test |
| Adaptive · Adaptive config | design only, feature not built | C | no adaptive or IRT (question 2015) |
| AdaptiveSimulated · Adaptive simulation results | design only, feature not built | C | as above |
| Timing · Timing and navigation | live (gap) | B | `Exam.durationMinutes`, `ExamSection.targetDurationMinutes`, shuffle, window; extra time per invitation. Gap: no forward-only navigation (`forward.?only` in exam code: none) |
| Proctoring · Proctoring mode | live (gap) | B | the per-test switches on `Exam` (webcam, AI analysis, record only, screen capture, lockdown, face check, enforcement, strike limit). Gap: the four named modes |
| ReviewBlocked · Pre-publish checklist, blocked | live (gap) | B | publish refuses one problem at a time (lines 637 to 700). Gap: the checklist and the approver for big tests (`asmt.high_stakes`) |
| ReviewReady · Pre-publish checklist, ready | live (gap) | B | as above |

#### PRC-05 · Item analysis

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Default | wire design | B | `GET /analytics/questions/flagged` and `/difficulty-calibration`; flags shown on `/v2/questions` |
| Provisional · Provisional (under 200 attempts) | live (gap) | B | the API hides a question under 20 answers (`MIN_RESPONSES`). Gap: no "provisional" band under 200 |
| Loading · Loading | wire design | B | as Default |

#### PRC-06 · Candidate score report

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| TestOwner · Test owner view (section cut-off not met) | live (gap) | A | `/v2/reports/[examId]/candidates/[candidateId]` (`GET /reports/:id/candidates/:cid/report`): score, sections, integrity, AI insight. Gap: no section cut-off field on `ExamSection` |
| Recruiter · Recruiter view | live (gap) | A | the same page. Gap: no narrower recruiter view; answer keys and full detail go to every reader |
| Held · Held: incident open | live (gap) | B | `POST /attempts/:id/results/hold`. Gap: no incident record behind a hold |
| Adaptive · Adaptive test (θ ± SE) | design only, feature not built | C | no adaptive |

### 2. Delivery and drives (PRC-07 to PRC-11, PRC-29, PRC-30)

#### PRC-07 · Invitations and drives

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Invitations · Invitations | wire design | A | `GET|POST /exams/:examId/invitations`, resend, revoke; today `CandidatesPanel` on `/v2/exams/[id]/edit`; Hire sends tests too (bulk and on a stage) |
| Drives · Drives | live (gap) | A | `/v2/walk-in-groups`, `/v2/drives/[driveId]` (drive sessions with windows, live roster, results). Gap: the drawn drives list with counts per drive |
| InviteDrawer · Invite candidates | wire design | A | `POST /exams/:examId/invitations`, `POST /candidates/bulk-upload-invite` |
| MissedCandidate · Missed test: re-invite | live (gap) | A | `POST /invitations/:id/resend`; a finished drive relabels "registered" as "did not attempt" in the page. Gap: no "missed" status or re-invite rule |
| EmployeeTestTaker · Employee test-taker | design only, feature not built | B | `Invitation.candidateId` only; no employee test-taker (question 2016) |
| Empty · Empty | wire design | A | as Invitations |
| Loading · Loading | wire design | A | as Invitations |
| Error · Error | wire design | A | as Invitations |

#### PRC-08 · Slot calendar

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Centre slot selected | design only, feature not built | C | tests run in a window (`Exam.availabilityWindowStart|End`, drive session windows); no slots, centres or proctor staffing |
| FullSlot · Full slot | design only, feature not built | C | as above |
| ShortOfProctors · Short of proctors | design only, feature not built | C | as above |
| Empty · Empty week | design only, feature not built | C | as above |
| Loading · Loading | design only, feature not built | C | as above |
| Error · Error | design only, feature not built | C | as above |

#### PRC-09 · Drive capacity planner

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Draft · Draft plan, 3 waves | design only, feature not built | C | no waves, seats or proctor capacity; drive sessions only check that windows do not overlap (`drives.service.ts`) |
| OverCapacity · Wave over capacity (blocked) | design only, feature not built | C | as above |
| Approved · Approved | design only, feature not built | C | as above |

#### PRC-10 · Connectivity panel

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| OverCap · Over the 10-minute cap: approve extra | live (gap) | B | AS-4b: `/yx/hiring/assessments/connectivity`; time above `asmt.time_credit_cap` waits (`connectivity_credits`), approved with a reason. Gap: the face re-check before resuming |
| WithinCap · Within cap: credited automatically | live (gap) | B | paused time is credited (`Attempt.pausedDurationMs`, `monitoring.service.ts` line 91). Gap: a plain drop without a pause is not credited; no cap (`asmt.time_credit_cap`) |
| Confirm · Approve extra time confirmation | live | B | AS-4b: the confirmation; a reason of 10+ characters first (also a database check) |
| Approved · Approved | live | B | AS-4b: approved time goes to a running test only; audited |
| LiveOverCap · Company: over the cap, test running | live | B | AS-4b: the waiting gaps and the decision for the selected one |
| LiveEnded · Company: test ended, decline only | live | B | AS-4b: an ended test cannot get time back (409) |
| LiveNothing · Company: nothing waiting | live | B | AS-4b: empty |

#### PRC-11 · Accommodation review queue

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Review · Review a request | live | B | AS-4b: `/yx/hiring/assessments/accommodations`, decided item by item; approved extra time becomes the invitation's; the evidence opens through an audited link. "Ask for more information" is not built (2203) |
| Queue · Queue | live | B | AS-4b: waiting and decided tabs (`GET /asmt/accommodations`) |
| HrLd · HR / L&D (employee test-takers) | design only, feature not built | B | no employee test-takers |
| Empty · Empty | design only, feature not built | B | as Queue |
| Loading · Loading | design only, feature not built | B | as Queue |
| LiveWaiting · Company: requests waiting | live | B | AS-4b |
| LiveDecided · Company: decided | live | B | AS-4b |

#### PRC-29 · Campus drive kit

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Registrants · Registrants with dedupe | live (gap) | A | public walk-in sign-up (`/public/walk-in/:orgSlug/register`) matches a known candidate by email and keeps their record (`walk-in.service.ts`); the drive roster. Gap: no registrants list with duplicates to merge |
| RegistrationForm · Registration form settings | live (gap) | A | `/walk-in/[orgSlug]` has a fixed form. Gap: no form settings |
| Institutions · Institution master | design only, feature not built | A | `institution|college` in exam code: none |
| AdmitCards · Admit cards | design only, feature not built | C | `admit.?card`: none; in-hall check-in goes with test centres |
| CollegeReport · College-wise report | design only, feature not built | A | no institutions |
| Coordinator · College coordinator portal | design only, feature not built | A | no coordinator sign-in |
| CoordinatorNoResults · College coordinator, results not shared | design only, feature not built | A | as above |

#### PRC-30 · Invigilator app

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| RollCall · Roll call · phone | phone view, mobile app not built | C | in-hall invigilation |
| Scan · Admit-card QR check-in · phone | phone view, mobile app not built | C | as above |
| IdMismatch · Photo ID mismatch: admit with reason · phone | phone view, mobile app not built | C | as above |
| Incident · Incident log · phone | phone view, mobile app not built | C | as above |
| Offline · Offline sync status · phone | phone view, mobile app not built | C | as above |

### 3. Proctoring and live (PRC-12 to PRC-15)

#### PRC-12 · Proctoring settings

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| RecordAndReview · Record & review with action matrix | live (gap) | B | per test: `proctoringEnforcement`, `proctoringStrikeLimit`, `disabledProctoringSignalsJson`, `faceMismatchAction` (warn, pause, block), `webcamRecordOnly`; set on `/v2/exams/[id]/edit` (`ExamDetailsForm`). Gap: the off / flag / warn / pause / end matrix per detection and mode minimums |
| Live · Live: mode minimums locked | design only, feature not built | C | no live proctoring by a person watching (question 2007) |
| Open · Open (matrix off) | live (gap) | B | `enableAntiCheating` off. Gap: the named mode |
| NoFaceDetection · No face detection | live (gap) | B | `faceVerificationEnabled` and `webcamAiAnalysisEnabled` off. Gap: the named mode |
| AiAllowed · AI-allowed test | design only, feature not built | B | no AI-allowed test or assistant log |
| Simple · Mode picker only | live (gap) | B | switches, not modes |

#### PRC-13 · Live console

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Grid · Tiles sorted by concern | live (gap) | B | `LiveMonitoringPanel` on `/v2/exams/[id]/edit`: roster sorted by status, time left, integrity level, snapshots, live over the monitoring socket. Gap: tiles by concern |
| HighConcernFilter · Filtered to high concern | live (gap) | B | a status filter; integrity level shown. Gap: a concern filter |
| TileDetail · Tile detail: timeline, chat, actions | live (gap) | B | `GET /attempts/:id/proctoring-events`, `POST|GET …/message(s)`, `unblock`, `proctoring-bypass` |
| TerminateConfirm · End attempt: confirmation with reason | live (gap) | B | `POST /attempts/:id/force-submit`. Gap: **no reason** is asked or stored |
| PauseConfirm · Pause: reason required | design only, feature not built | B | pauses are automatic only (screen share, face, enforcement); no proctor pause route |
| MissedStart · Proctor missing: 10-minute fall-back | design only, feature not built | C | no live proctor to miss |
| Empty · Empty | live (gap) | B | as Grid |
| Loading · Loading | live (gap) | B | as Grid |

#### PRC-14 · Proctor planner

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| WithYukthixPool · Own staff + YukthiX pool | design only, feature not built | C | no proctor staffing or YukthiX pool |
| OwnStaffOnly · Not opted in: own staff only | design only, feature not built | C | as above |

#### PRC-15 · Company audit view

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Grouped by slot | design only, feature not built | C | "YukthiX proctor activity": no YukthiX proctors |
| Empty · Empty | design only, feature not built | C | as above |
| Loading · Loading | design only, feature not built | C | as above |
| Error · Error | design only, feature not built | C | as above |

### 4. Integrity and marking (PRC-16 to PRC-20)

#### PRC-16 · Integrity review queue

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Queue · Queue ordered by score | live (gap) | B | each attempt has an integrity level and reasons (`proctoring_analyses`, `integrity/integrity-analysis.service.ts`), shown per test and per candidate on /v2. Gap: no queue, owner or status |
| ConflictOfInterest · Reassign blocked: conflict of interest | design only, feature not built | B | no reviewer assignment |
| Capacity · Reviewer capacity and SLA | design only, feature not built | C | reviewer pools and SLA at scale |
| Empty · Empty | live (gap) | B | as Queue |
| Loading · Loading | live (gap) | B | as Queue |
| Error · Error | live (gap) | B | as Queue |

#### PRC-17 · Incident workspace

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Review · Flag review: playback, timeline, evidence | live (gap) | B | the /v2 candidate report: events timeline, snapshots, AI narrative, re-analyse (`POST /attempts/:id/reanalyze`). Gap: no incident record; no video playback (snapshots only) |
| DisqualifyNeedsSecond · Disqualify: second reviewer required | design only, feature not built | B | `disqualif|verdict` hits are face-voter internals, not decisions |
| Accept · Accept (cleared) with reason | design only, feature not built | B | no decision record (proctoring bypass with a reason is a different action) |
| SecondReview · Second reviewer | design only, feature not built | B | as above |
| IdentityMismatch · Identity mismatch | live (gap) | B | face mismatch events and `faceMismatchAction`. Gap: no ID decision |
| Decided · Verdict given | design only, feature not built | B | no verdicts |
| Escalated · Escalated: legal hold and evidence export | design only, feature not built | B | `legal.?hold`: none; retention deletes after 90 days regardless |

#### PRC-18 · Appeals queue

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Decide an appeal | design only, feature not built | B | `appeal` in exam code: none (question 2012) |
| Overturned · Overturned | design only, feature not built | B | as above |
| Upheld · Upheld | design only, feature not built | B | as above |
| Empty · Empty | design only, feature not built | B | as above |
| Loading · Loading | design only, feature not built | B | as above |

#### PRC-19 · Evaluator console

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Blind · Blind marking, not scored yet | live (gap) | B | `GradingQueuePanel` (`GET /exams/:id/pending-grading`, `POST …/answers/:qid/grade`, `finalize-manual-grade`). Gap: names are shown (`blind`: none) |
| ScoredWithAi · Scored: AI suggestion revealed | live (gap) | B | AI code review per answer (`…/code-review`, regenerate). Gap: none for essays; shown before marking, not after |
| Moderation · Disagreement: moderation | design only, feature not built | B | one marker only (`moderat` hits are rate limits) |
| Code · Code response | live (gap) | B | code answers with Piston runs, auto-graded tests (`grading/code-autograde.service.ts`) and AI review |
| AiAllowed · AI-allowed test: assistant log | design only, feature not built | B | no AI-allowed tests |
| Minor · Under-18: human only | design only, feature not built | B | no age on the candidate side of tests |
| NotBlind · Blind mode off | live (gap) | B | today's marking (names shown) |

#### PRC-20 · Integrity reports

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Collusion · Collusion | design only, feature not built | B | `collusion`: none |
| Plagiarism · Plagiarism and code similarity | live (gap) | B | each code answer is compared with other candidates' answers to the same question and flagged (`integrity-analysis.service.ts` line 74). Gap: no report page |
| Agreement · Inter-rater agreement | design only, feature not built | B | one marker only |
| Empty · Empty | design only, feature not built | B | no report page |
| Loading · Loading | design only, feature not built | B | as above |

### 5. Candidate (PRC-21 to PRC-28, PRC-31, PRC-32)

#### PRC-21 · Candidate portal home

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| MyTests · My tests (booked, under review, missed) | live (gap) | A | one test per invitation link (`/welcome`, candidate token from `candidate-auth/redeem`); the careers portal shows the Assessment step. Gap: no list of a candidate's tests |
| Booking · Book a slot | design only, feature not built | C | no slots |
| Reschedule · Change slot | design only, feature not built | C | `reschedul`: none |
| RescheduleBlocked · Change slot blocked (2 used) | design only, feature not built | C | as above |
| Empty · Empty | design only, feature not built | A | no list |
| Phone · My tests · phone | phone view, mobile app not built | A | |

#### PRC-22 · Readiness check and practice

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Issues · System check: fails with fix steps | live (gap) | B | AS-4b: `/readiness` checks camera, displays, screen sharing, Safe Exam Browser, network delay and the device in the browser, with fix steps. Gap: microphone, bandwidth and blocked apps (a browser cannot see them) |
| Running · System check running | live | B | AS-4b: the rows show while the checks run |
| Passed · All passed: practice test | live (gap) | B | `PracticeStep` (an ungraded practice question before consent). Gap: not a full practice test |
| SecureClient · Secure Client install and self-test | live (gap) | B | `Exam.lockdownRequired`, `GET /attempt/seb-config` (Safe Exam Browser). Gap: the self-test |
| Phone · System check · phone | phone view, mobile app not built | B | |
| LiveChecks · Your computer: one problem blocks the start | live | B | AS-4b: `/readiness` |
| LiveRunning · Your computer: checking | live | B | AS-4b |

#### PRC-23 · Accommodation request

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Form · Request with evidence upload | live | B | AS-4b: `/accommodation` (`POST /attempt/accommodation`), evidence PDF, JPG or PNG up to 10 MB checked by its first bytes |
| Submitted · Submitted | live | B | AS-4b: one open request; the decision and message show on the same page |
| Employee · Employee: HR / L&D decides | design only, feature not built | B | no employee test-takers |
| LiveAsk · Candidate: ask with evidence | live | B | AS-4b |
| LiveWaiting · Candidate: request waiting | live | B | AS-4b |
| LiveApproved · Candidate: approved for you | live | B | AS-4b (answer 2164) |

#### PRC-24 · Consent and what we record

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Default | live (gap) | B | the consent step on `/welcome` (`Attempt.consentAt`). Gap: "what we record" by mode and the retention days |
| Minor · Under 18: guardian consent | design only, feature not built | B | no guardian consent |
| NoFaceDetection · No face detection | live (gap) | B | with face checks off the step skips enrolment |
| Declined · Declined: manual path offered | live (gap) | B | AS-4b: on `/welcome`, a candidate who says no (or whose photo fails) under a required photo asks for a manual identity check; once approved they start without the photo. Gap: no video call; the designed consent screen is not on `/welcome` yet (2201) |
| Phone · Consent · phone | phone view, mobile app not built | B | |

#### PRC-25 · ID check, room scan, phone pairing

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| IdCard · ID card capture | design only, feature not built | C | `id.?card|government.?id`: none |
| IdBlurry · ID photo blurry | design only, feature not built | C | as above |
| Selfie · Selfie and liveness | live (gap) | B | face enrolment (reference selfie) and in-test face match (`exam-runtime/src/face`). Gap: no liveness |
| LivenessFailed · Liveness failed: retry | design only, feature not built | C | `liveness`: none |
| ManualReview · Manual review by proctor | design only, feature not built | C | no ID review |
| RoomScan · Room scan | design only, feature not built | C | `room.?scan`: none |
| PhonePairing · Companion phone pairing | design only, feature not built | C | `pairing|companion`: none |
| WaitingRoom · Live waiting room (10-minute fall-back) | design only, feature not built | C | no live proctoring |

#### PRC-26 · Test runner

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Mcq · Multiple choice with sections | wire design | B | exam-runtime `/attempt/start|answer`, sections, navigator, mark for review; today `(candidate)/exam` |
| Coding · Coding question | wire design | B | `POST /attempt/run-code` (Piston), starter code, tests |
| Descriptive · Descriptive answer | wire design | B | `essay` type, `POST /attempt/answer` |
| CalculatorOpen · Calculator | design only, feature not built | B | `calculator`: none |
| Accessibility · Accessibility settings: large text, high contrast | design only, feature not built | B | no runner text size or contrast settings |
| Reconnecting · Reconnecting: answers kept on device | design only, feature not built | B | no local copy of answers (`localStorage|offline|reconnect` in the runner: none; `asmt.offline_minutes`) |
| WeakConnection · Weak connection | design only, feature not built | B | as above |
| Break · Break between sections | design only, feature not built | B | no section breaks |
| PausedByProctor · Paused by proctor | live (gap) | B | the runner shows paused states (`status: 'paused'`, `pausedReason`). Gap: a proctor cannot pause |
| AiAllowed · AI-allowed test: logged assistant | design only, feature not built | B | no AI-allowed tests |
| Finish · Finish confirmation | wire design | B | `POST /attempt/submit` |
| Submitted · Submitted and optional survey | live (gap) | B | `/submitted` (`ResultSummary`). Gap: no after-test survey (`survey` on that page: none) |
| LiveOfflineStopped · Live · offline past the limit (answers kept on device) | live | B | AS-4a: `asmt.offline_minutes`; answers kept on the device until the server has them |
| LiveSubmittedSurvey · Live · submitted, survey | live | B | AS-4a: `/submitted` with the optional survey |
| LiveBreak · Live · on a break | live | B | AS-4a: `POST /attempt/break/start|end`; the timer stops for at most the break's length |
| LiveReaderApproved · Live · screen-reader mode approved for you | live | B | AS-4b (answer 2164): shown only when approved; `/exam` still uses the older runner (2161) |

#### PRC-27 · Result and appeal

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Released · Released | live (gap) | B | `Exam.resultsReleaseMode`, `feedbackVisibility`, per-attempt release, certificate (`GET /attempt/certificate`). Gap: the 8 release elements of 6.5 |
| Held · Under review (held) | live (gap) | B | `POST /attempts/:id/results/hold`. Gap: no reason shown to the candidate |
| Verdict · Verdict with appeal window | design only, feature not built | B | no verdicts |
| AppealForm · Appeal form | design only, feature not built | B | no appeals |
| AppealSent · Appeal sent | design only, feature not built | B | as above |
| WindowClosed · Appeal window closed | design only, feature not built | B | as above |
| Phone · Result · phone | phone view, mobile app not built | B | |
| LiveReleased · Live · released | live | B | AS-4a: `/result`, only what the test shows |
| LiveHeld · Live · held for review | live | B | AS-4a: a held result shows no score |

#### PRC-28 · Privacy centre

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Default · Default | design only, feature not built | B | candidates cannot see their data; HR erases (`candidate:data_rights`, `candidates.controller.ts` line 81; `/yx/hiring/retention`) |
| ConfirmErase · Erase: confirmation | design only, feature not built | B | as above |
| LegalHold · Erasure blocked by open appeal | design only, feature not built | B | no appeals or legal hold |
| Requested · Erasure requested | design only, feature not built | B | as Default |

#### PRC-31 · Candidate app

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| MyTests · My tests · phone | phone view, mobile app not built | A | |
| Readiness · Readiness · phone | phone view, mobile app not built | B | |
| Pinning · Screen pinning required · phone | phone view, mobile app not built | B | |
| Runner · Proctored runner · phone | phone view, mobile app not built | B | |
| Result · Result · phone | phone view, mobile app not built | B | |
| Privacy · Privacy centre · phone | phone view, mobile app not built | B | |

#### PRC-32 · Result-reuse consent

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Reuse · Reuse with consent | design only, feature not built | A | an invitation is per test and candidate; nothing offers an earlier result (question 2013) |
| Retake · Choose to retake | design only, feature not built | A | as above |
| Expired · Outside validity window | design only, feature not built | A | as above |

### 6. Extras and kit

#### Extra · Fairness analytics

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Finding · Adverse-impact finding | design only, feature not built | B | `adverse.?impact|four.?fifths`: none. Hire's bias audits (HIR-23) store outside audit reports; they do not compute pass rates (question 2019) |
| NoFinding · No finding | design only, feature not built | B | as above |
| ValiditySuppressed · Predictive validity suppressed (small sample) | design only, feature not built | B | as above |

#### Extra · ID manual review queue

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| LowMatch · Low face-match score | design only, feature not built | C | no ID check or review queue |
| AlternatePath · No government ID: alternate path | design only, feature not built | C | as above |
| Approved · Approved | design only, feature not built | C | as above |
| NotVerified · Not verified: live check offered | design only, feature not built | C | as above |

#### Extra · Test centre console

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Syncing · Session running, syncing | design only, feature not built | C | no test centres |
| Offline · Centre offline, sealed locally | design only, feature not built | C | as above |
| Verified · Full sync verified | design only, feature not built | C | as above |

#### Kit · Proctoring building blocks

Shared parts, not pages. None is used by a live page; the older pages have their own versions, named in the note.

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| Cameras · Cameras | design only, feature not built | B | older own version: `CameraPreview` |
| SystemCheck · System check rows | design only, feature not built | B | older: the `/welcome` steps |
| IntegrityScore · Integrity score card | design only, feature not built | B | older: the integrity level on the /v2 report |
| IntegrityClear · Integrity score card, no signals | design only, feature not built | B | as above |
| Tiles · Live proctor tiles | design only, feature not built | B | older: `LiveMonitoringPanel` rows |
| Timeline · Flag timeline | design only, feature not built | B | older: the events list on the /v2 report |
| Evidence · Evidence | design only, feature not built | B | older: snapshots on the /v2 report |
| Connection · Connection | design only, feature not built | B | older: online state in the roster |
| CalculatorTool · Calculator | design only, feature not built | B | no calculator |
| Code · Code answer | design only, feature not built | B | older: the runner's code editor and `CodeOutputPanel` |
| QrAndId · QR and ID capture | design only, feature not built | C | no admit cards or ID capture |

### 7. Settings 6.5

#### Settings 6.5

| story (sub-page) | verdict | bucket | note |
|---|---|---|---|
| P6_5 · 6.5 Assessments | design only, feature not built | B | registry page `6.5` (`registry-g5-g6.ts` line 1229): 30 company defaults in Question bank, Test defaults, Delivery defaults, Proctoring, Results & retention. No API holds any of them; the older product keeps choices per test on `exams`, and retention is fixed at 90 days in code. Parts that are C (live ratio, YukthiX proctors, ID check, room scan, slot booking) are shown only when those features exist |
| P6_5_ReadOnly · 6.5 Assessments · read-only | design only, feature not built | B | as the page |

## 4. What can be reused, and what is missing

Reuse (never a second version): the whole older engine in section 1.1: question bank and AI drafts, item statistics,
test builder with pools and publish checks, per-test settings, invitations, walk-in drives, exam-runtime (runner, code
runs, grading, face checks, integrity analysis, live monitoring), marking, results and release, certificates, the
retention sweeps, Hire's job tests and stage auto-send, and the e2e suites. The designed screens replace the /v2 pages
and the candidate pages one by one, each /v2 page retired with a redirect when its designed screen is live (as Hire
did, `next.config.test.ts` "a v2 hiring page is retired with a redirect once its YukthiX screen ships").

Missing for A and B: company isolation for the eleven child tables, YukthiX keys, the 6.5 company defaults, question
versions, review and duplicate check, alt text, translations, exposure cap, the blueprint grid, templates, build from a
job description, the named proctoring modes and action matrix, a reason to end and a proctor pause, an incident record
with verdicts and a second reviewer, appeals, legal hold, blind marking and moderation, AI-allowed tests, integrity
reports, a candidate's test list, accommodation requests, connectivity credit with a cap, answers kept on the device,
calculator, accessibility, breaks, readiness rows, consent detail and a manual path, the privacy centre, result reuse,
campus registrants, form, institutions, college report and coordinators, fairness analytics.

## 5. Questions for the founder (before building)

2001. **Where assessments sit.** *Suggested: in Hire, a menu group "Assessments" (Question bank, Tests, Invitations &
      drives, Live console, Reviews, Marking, Reports), shown to people with an assessments key. Companies that use
      tests today keep them; a company setting `assessments.enabled`, default on.*
2002. **One engine, never two.** *Suggested: make each designed screen live on the existing exam API and
      exam-runtime service, then retire its /v2 page with a redirect, one by one. No new exam engine.*
2003. **YukthiX keys.** All exam routes use older keys, and no YukthiX role template can write tests. *Suggested: new
      keys `asmt.bank.manage`, `asmt.test.manage`, `asmt.proctor`, `asmt.evaluate`, `asmt.results.view` and
      `assessments.settings.manage`; the older keys keep working as aliases; the Recruiter template gets bank, test,
      proctor, evaluate and results; the Hiring manager template gets results only.*
2004. **Who sees results and answer keys.** Today an interview coordinator and a hiring manager can read every test's
      answer key and every result in the company. *Suggested: answer keys only with `asmt.test.manage` or
      `asmt.bank.manage`; a hiring manager sees results only for candidates of their own jobs; an interview coordinator
      sees no results (as their template already says). Fixed in the first slice.*
2005. **Company isolation in the database.** *Suggested: add the company to the eleven tables that hold candidate
      answers, evidence and face data, with the same forced row-level security as every other area, before any new
      screen goes live.*
2006. **Acting, step-up and reasons.** *Suggested: refuse every assessments change while acting for someone else;
      ask for the second factor again to end an attempt, overturn a verdict, release results or finish marking; ending
      or pausing an attempt needs a reason the candidate's record keeps.*
2007. **Proctoring for hiring.** *Suggested: three modes now: Open, AI-only and Record & review (the existing switches
      grouped into modes); company default AI-only as 6.5 draws. Live proctoring by a person and YukthiX professional
      proctors wait for certification.*
2008. **Keeping recordings and face data.** Today fixed at 90 days. *Suggested: the 6.5 setting, 30 to 365 days,
      default 30 as drawn; evidence of an open incident or appeal is kept until it closes (legal hold).*
2009. **Reviewing questions.** *Suggested: every new or changed question is reviewed by one other person before use;
      a second approver per collection is a setting, default off; AI drafts are always reviewed.*
2010. **Versions and languages.** *Suggested: a big change (stem, options, answer key) makes a new version and old
      attempts keep theirs. Question languages: English only by default; other languages are a company setting and
      every translation is reviewed by a person.*
2011. **Extra time and other help.** *Suggested: a candidate asks for help with evidence; the test owner decides;
      the decision becomes the invitation's extra time, as today. Connectivity credit is automatic up to a company cap,
      default 10 minutes per attempt, above that a person approves.*
2012. **Appeals in hiring tests.** *Suggested: a candidate may appeal an integrity decision (not the marks) within a
      company setting, default 7 days; the result is held while the appeal is open.*
2013. **Using an earlier result.** *Suggested: when a candidate applies to another job with the same test, they may
      use their earlier result if it is within 6 months (company setting) or retake it after the wait between attempts;
      the candidate chooses.*
2014. **Campus drives.** *Suggested: build registrants with duplicate merge, form settings, institutions, the
      college report and the college coordinator's view on the existing walk-in drives now. Admit cards, in-hall check-in
      and the invigilator app wait for test centres.*
2015. **Adaptive tests.** *Suggested: park with certification; hiring tests use fixed or pool sections, which exist.*
2016. **Employees taking tests.** *Suggested: not now; it comes with Learning (6.4). The engine keeps a test-taker that
      can be a candidate today and an employee later.*
2017. **Starter question packs.** *Suggested: YukthiX writes two starter packs first (Aptitude and English, about 200
      reviewed questions each), then Core IT; a company can switch packs on or off in 6.5. This is content work, not
      code.*
2018. **Phones.** *Suggested: phone views wait for the mobile app; proctored tests stay desktop only (6.5 default
      "Desktop only").*
2019. **Fairness check.** *Suggested: pass rates per group for each hiring test, only from candidates who chose to
      answer a voluntary diversity question, hidden when a group is smaller than a company setting (default 30); a
      finding opens a review task. Built after the core.*
2020. **The design guard missed one screen.** *Suggested: rename the PRC-13 story title to "Proctor console" (or fix
      the guard) so the live-console screen is counted as not live.*
2021. **Assessment cost in Recruiting costs (answer 233).** *Suggested: no change; post a cost only when assessment
      pricing exists.*

## 6. Build plan for buckets A and B (slices, at most 3 builders at once)

| slice | what | reuses | size | rough estimate |
|---|---|---|---|---|
| AS-0 | Security first: company column and forced RLS on the eleven child tables (filled from the exam), YukthiX keys with aliases, the `results:view` alias fix, answer keys only for writers, results limited to own jobs, refuse while acting, step-up and a reason to end (2003 to 2006) | `tenant_rls` loop, `ats-keys.ts` pattern, `OwnSessionGuard`, the four cross-company e2e suites | M | 5 days |
| AS-1 | Question bank: PRC-01, PRC-02 (versions, duplicate check, alt text, translations behind the language setting), PRC-03 review queue, PRC-05 item analysis (2009, 2010, 2017) | questions, AI drafts, item statistics | L | 9 days |
| AS-2 | Tests and settings: PRC-04 (blueprint grid, templates, checklist and approver, build from a job description), PRC-12 modes over the existing switches, PRC-06 score report, Settings 6.5 company defaults with the retention setting replacing the fixed 90 days (2007, 2008) | exams, publish checks, settings registry, retention sweeps | L | 9 days |
| AS-3 | Hiring delivery (A): PRC-07 invitations and drives with Hire's job tests, PRC-21 candidate's test list, PRC-32 result reuse, PRC-29 campus kit without admit cards (2001, 2013, 2014) | invitations, walk-in, drives, `job_exams`, candidate sign-in | L | 10 days |
| AS-4a | Designed runner: PRC-26 on exam-runtime (answers kept on the device, calculator, accessibility, breaks, finish and survey), PRC-27 released and held | exam-runtime attempts, code runs, grading, release | L | 10 days |
| AS-4b | Before the test: PRC-22 readiness, PRC-24 consent with a manual path, PRC-25 selfie, PRC-23 and PRC-11 accommodation, PRC-10 connectivity credit (2011) | `/welcome` steps, face enrolment, extra time, paused-time credit | M | 7 days |
| AS-5 | Review: PRC-13 live console (pause and end with reasons), PRC-16 queue, PRC-17 incidents with verdicts and a second reviewer, legal hold, PRC-18 and PRC-27 appeals, PRC-20 reports, PRC-28 privacy centre (2012) | monitoring socket, integrity analysis, attempts-admin, data rights | L | 10 days |
| AS-6 | Marking and fairness: PRC-19 (blind marking, AI suggestion after marking, moderation, under-18 human only), AI-allowed tests (PRC-12, PRC-19, PRC-26), fairness analytics (2019) | grading queue, AI code review | M | 8 days |

Not in the plan (B stories that wait on another area): employee test-takers (PRC-07 EmployeeTestTaker, PRC-11 HrLd,
PRC-23 Employee) wait for Learning (2016); phone views wait for the mobile app (2018).

Order (at most three builders at once):

1. Wave 1: AS-0, AS-1 and AS-2 together (AS-1 and AS-2 touch only tables that already have RLS; neither goes live
   before AS-0 merges). Three builders, 9 days.
2. Wave 2: AS-3, AS-4a and AS-4b (each needs AS-0's keys and AS-2's settings). Three builders, 10 days.
3. Wave 3: AS-5 and AS-6 (they need the runner's states and AS-0's isolation). Two builders, 10 days.

Every slice draws any new state in the kit first, keeps RLS, audits every write, refuses while acting, adds positive
and negative tests and an e2e suite, and retires the /v2 page it replaces.

**Estimate for A and B:** 68 builder-days (5 + 9 + 9 + 10 + 10 + 7 + 10 + 8), about **82 builder-days with a 20%
allowance** for the verify pass, manual test write-ups and fixes; about 9 + 10 + 10 = **29 working days end to end (6
weeks)** with the waves above. Hiring tests become usable on designed screens after wave 2 (about 4 weeks).

**Rough estimate for C (one line):** test centres and their console, ID check with liveness and manual review, room
scan and phone pairing, live proctoring with the YukthiX proctor pool, planner and audit, slot booking and
rescheduling, the capacity planner, adaptive tests, admit cards and the invigilator app, exam owners and paid booking:
about **90 to 120 builder-days**, plus outside vendors (ID checks, payments) and the mobile apps, started only with a
real certification customer.

### AS-0 as built (13 Nov 2026, branch feat/yukthix-assessments-as0)

No new screens: AS-0 is the security slice under the existing routes and the /v2 pages. What changed:

- **Company isolation (2005).** Fourteen tables get `organization_id`, filled from the parent and kept filled by a
  BEFORE INSERT trigger, made required, indexed and put under the forced `tenant_isolation` policy
  (`202617z0000301_assessments_company_rls`; the super-admin context is set before any data is written). The eleven
  tables listed above plus `results`, `integrity_analyses` and `candidate_messages` (they hold scores and messages). The
  candidate runtime's three reads without a company context (link sign-in, the session check, last-seen) now run in one.
- **YukthiX keys (2003).** `asmt.bank.manage`, `asmt.test.manage`, `asmt.proctor`, `asmt.evaluate`,
  `asmt.results.view`, `assessments.settings.manage`. The older keys keep working: `exam:manage` ← `asmt.test.manage`,
  `question_bank:manage` and `question_bank:view` ← `asmt.bank.manage`, `results:view` ← `asmt.results.view` (plus
  `ats.assessment.view`, `ats.candidate.manage`; never `ats.candidate.view`). Proctor routes (events, messages, unblock,
  end, excuse, re-analyse) take `exam:manage` or `asmt.proctor`; marking routes (grade, finish marking, code review,
  pending marking, release and hold results, AI insight again) take `exam:manage` or `asmt.evaluate`; the certificate
  template takes `exam:manage` or `assessments.settings.manage`. Templates: Recruiter + bank, test, proctor, evaluate,
  results; Hiring manager + results; Hiring admin + assessment settings.
- **Who sees results (2004).** Answer keys only for writers (the hotfix). Results: test writers, recruiters
  (`pipeline:manage`), hiring admins (`ats.headcount.manage`) and auditors read every candidate; anyone else who reads
  results (the Hiring manager) reads only candidates who applied to one of their own jobs (hiring manager of the job, or
  its creator) in the results list, summary, accuracy, report, compare, export, drive roster and AI insight (another
  job's candidate is 404); the company-wide /v2 dashboard is refused to them (403, question 2061). The Interview
  coordinator keeps "Jobs & requisitions", the jobs, the job board, candidate profile and résumé, feedback, fit and the
  pickers (candidate view is enough on those reads) but sees no test result anywhere (the board's results are empty;
  every test and results route is 403).
- **Acting, step-up, reasons (2006).** Every assessments change is refused while acting for someone else (reads stay
  open). The second factor again to end an attempt, overturn a proctoring verdict (unblock, excuse from proctoring),
  release results and finish marking. Ending an attempt needs a reason; it is kept on the candidate's timeline
  (`ended_by_staff` event) and in the audit log.

Tests: `test/assessments-as0.e2e-spec.ts` (cross-company reads and writes, each key, own-job results, the coordinator,
acting, step-up and reasons), `src/rbac/results-scope.spec.ts`; the suites that end attempts, unblock or finish marking
now prove the second factor first.

### Questions (from 2061)

2061. **The company-wide test dashboard for a Hiring manager.** It is refused to them now (it counts every candidate).
      *Suggested: AS-2's score report gets an own-jobs view for Hiring managers.*
2062. **Two more tables without a company column.** `candidate_refresh_tokens` and `notifications` (invitation email
      delivery) hold no answers or scores and are read by token at sign-in. *Suggested: add the column and RLS in AS-3,
      with invitations and delivery.*
2063. **Pausing an attempt.** Staff cannot pause today (the system blocks; staff unblock or end), so the reason rule
      covers ending. *Suggested: AS-5's live console adds pause, with a reason, as drawn.*
2064. **No step-up to undo an excuse or to hold results.** Both return to the stricter state. *Suggested: keep as is.*
2065. **Proctor- or marker-only people.** With only `asmt.proctor` or `asmt.evaluate` they can act on an attempt but
      cannot open the test page (it needs a test or results key). *Suggested: AS-5 and AS-6 open their own pages to
      them.*
2066. **"Own jobs" for a Hiring manager.** A candidate is theirs when the candidate applied to a job they are the hiring
      manager of, or opened; then all that candidate's test results show. *Suggested: keep; a per-job restriction comes
      with AS-3's job tests.*

## AS-4a as built, part 1 (branch `feat/yukthix-assessments-as4a`, 16 Nov 2026)

The designed runner's rules on exam-runtime, the designed submitted and result steps live, and the designed runner
ready with `live`. The in-test page `/exam` is not switched to the designed runner yet (see 2161).

- **Data:** migration `202617z0000311_asmt_runner`. `answers.question_version` (answer 2122: the version each answer saw)
  and `answers.client_saved_at`; per test `exams.calculator` (none, basic, scientific; default none), `breaks_allowed`
  (0 to 5, default 0) and `break_minutes` (1 to 30, default 5); per attempt `breaks_used` and `offline_credit_ms`; new
  table `attempt_surveys` (one per attempt, forced RLS, company filled from the attempt, the app may not change or delete
  a row).
- **Settings (registry, Settings 6.5 defaults):** `asmt.offline_minutes` (5) and `asmt.time_credit_cap` (10), added here
  because AS-2 had not yet. The runtime reads them through its own copy of the keys; the runtime e2e checks they match.
- **Answers kept on the device:** every save carries the device time and is kept in the browser until the server has it
  (it survives a reload while offline, and is sent when the connection returns, oldest first). The server never lets an
  older copy overwrite a newer one, and counts a device time in the future as now. A refusal from the server is not
  retried; a lost connection shows no error toast.
- **Time given back for a lost connection:** measured by the server before any request is handled (the gap since the
  attempt was last seen, beyond the 30-second check-in and a 45-second grace), up to `asmt.time_credit_cap` per attempt,
  kept on the attempt for reviewers. `POST /attempt/reconnected` reports it.
- **Breaks:** `POST /attempt/break/start|end`. The timer stops for at most the test's break length; a break left longer
  ends on its own (also in the settlement); answering is refused during a break; two presses start one break.
- **Survey:** `POST /attempt/survey` (rating 1 to 5, instructions clear, a comment), only after the test, once.
- **Held result (PRC-27):** a result held for review shows as `held` with no score; manual release still shows as
  waiting.
- **Screens:** `TestRunnerScreen` with `live` (sections, connection and device copies, calculator, display settings,
  breaks, paused, finish, submitted with the survey) and `ResultAppealScreen` with `live` (released, held, not ready);
  stories PRC-26 (3) and PRC-27 (2). `/submitted` and the new `/result` render them; the design-live guard now scans the
  candidate pages and both left its "not live" list.
- **Also fixed:** the exam-runtime e2e config could not load the API since `file-type` arrived; it now has the API's
  transform list.
- **Tests:** runtime unit (interceptor 4, answer 1, existing specs updated); runtime e2e `runner` (5); kit
  `runner-live` (6); web `answer-queue` (3), `useAttempt` (2 new), submitted and result pages (4).

### Questions (from 2161)

2161. **Switching `/exam` to the designed runner.** The rules and the designed runner are built; the in-test page is
      still the older one, so breaks, the calculator, display settings and the connection banner are not shown yet
      (answers are already kept on the device). The older page has things the design does not draw yet: the review
      mode for marked or unanswered questions, "answer any 3 of 5" section chips, the phone question list, option
      pictures and code snippets. *Suggested: next slice, AS-4a part 2: draw those four in PRC-26 first, then switch the
      page (about 4 days, including its 60 page tests).*
2162. **Scientific calculator.** The kit draws a basic calculator; a test set to scientific shows the basic one.
      *Suggested: add the scientific keys to the kit calculator in part 2.*
2163. **Who sets breaks and the calculator.** They are per test, with defaults (no breaks, no calculator), but no
      screen sets them yet. *Suggested: AS-2's test builder adds them to the test settings.*
2164. **Screen-reader mode "approved for you".** The design shows it as an approved accommodation; accommodations come
      with AS-4b. *Suggested: show it from AS-4b's approved help.*
2165. **Reporting the survey.** Answers are stored; nobody can see them yet. *Suggested: a per-test summary in AS-6's
      fairness reports, only for groups of 5 or more.*
2166. **The grace before time is given back.** 45 seconds beyond the 30-second check-in; a browser that slows a hidden
      tab can look offline. *Suggested: keep; reviewers see the credit on the attempt.*

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 3 and fails unless every story of
every `Screens/Proctoring/` file, and the two Settings 6.5 stories, has exactly one row, in file order, under the
heading that is its title after the prefix, with one of the five verdicts and one of the three buckets. Copied from
`projects-design-map.md`; the prefix, the file, the Settings 6.5 block and the bucket column differ.

```js
// Run from the repo root: node check.js. Recounts section 3 of docs/yukthix/assessments-design-map.md and checks that
// every story under Screens/Proctoring/ (and Settings 6.5) has exactly one row, in file order. Reads the story files.
const fs = require('fs');
const path = require('path');
const PREFIX = 'Screens/Proctoring/';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const exportsOf = (src) => [...src.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
const want = {};
for (const f of walk('packages/yx-ui/src').filter((f) => f.endsWith('.stories.tsx'))) {
  const src = fs.readFileSync(f, 'utf8');
  const t = /title:\s*'([^']+)'/.exec(src)?.[1];
  // Capital first letter only: lower-case exports would be sample props.
  if (t?.startsWith(PREFIX)) want[t.slice(PREFIX.length)] = exportsOf(src);
}
want['Settings 6.5'] = exportsOf(fs.readFileSync('packages/yx-ui/src/screens/settings/settings-g6.stories.tsx', 'utf8')).filter((n) => /^P6_5(_|$)/.test(n));
const doc = fs.readFileSync('docs/yukthix/assessments-design-map.md', 'utf8');
const s3 = doc.split('## 3. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const B = ['A', 'B', 'C'];
const errs = [], counts = {};
for (const sec of s3.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 44), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries([...V, ...B].map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story file: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) {
      const [, , v, b] = l.split('|').map((x) => x.trim());
      if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`);
      if (B.includes(b)) c[b]++; else errs.push(`${head}: bad bucket ${b}`);
    }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story file with no rows: ' + h);
const all = { groups: 0, stories: 0, ...Object.fromEntries([...V, ...B].map((v) => [v, 0])) };
for (const c of Object.values(counts)) for (const k in all) all[k] += c[k];
counts['All 1-7'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```

**Founder answers (13 Nov 2026):** 2001 to 2021 all accepted as suggested ("ok for all"). Build starts with wave 1
(AS-0 first: security), after the answer-key hotfix (`fix/exam-answer-key-exposure`) merges.

**Founder answers (16 Nov 2026, "ok for all"), 2121 to 2130:** all accepted as suggested.
- 2121: when the bank goes in the menu, the older publish route refuses, changes to approved questions go through review, /v2/questions redirects.
- 2122: store the question version on each answer (AS-0 or AS-4a).
- 2123: AS-2's 6.5 page writes the second-approver setting as the per-collection table.
- 2124: keep all three packs on by default; the tab says they are being written.
- 2125: code-test editing next in the designed editor.
- 2126: image upload next (existing image route); other media later.
- 2127: per-test charts with AS-2's test builder.
- 2128: keep bulk Retire without review.
- 2129: a daily bell note to bank writers when items wait for review.
- 2130: keep text-only duplicate check at 90 %.
## AS-1 as built (branch `feat/yukthix-assessments-as1`, 16 Nov 2026)

Question bank: review, versions, duplicate check, alt text, translations and item analysis (answers 2009, 2010, 2017).
Not in the menu: the lead adds it after AS-0 merges. Pages: `/yx/hiring/assessments/questions`, `…/questions/[id]`
(`new` for a new one), `…/reviews`, `…/item-analysis`. Keys for now: `question_bank:manage` on every route
(TODO(AS-0): `asmt.bank.manage`).

- **Data:** migration `202617z0000231_question_bank_review`. `questions` gains `version`, `image_alt`, `option_alts`,
  `last_approved_by`, `last_approved_at`. New tables `question_revisions` (a proposed new question or change, its review,
  duplicate finding and field comments) and `question_translations` (per question, version and language), both with
  forced RLS and `tenant_isolation`; the app may not delete from them. The database also refuses a reviewer who is the
  author, a second approver who is the author or first reviewer, and an approval without its reviewers.
- **Review (2009):** a new question is a draft nobody can use; only its author changes and submits it. Another person
  approves or asks for changes (a note, comments per field; the author gets a bell note `asmt.question.changes_requested`).
  A collection listed in `asmt.bank.second_approver_collections` (none by default) needs a third person. AI drafts are
  reviewed like any other. Approving carries a row version: when two reviewers press at once, the second gets "reload it".
- **Versions (2010):** a change to an approved question waits as a revision; the question in use stays until approval.
  Text, type, options, the answer key, model answer or code tests make the next version (and restart item statistics);
  anything else is a minor change that keeps the number. Every approved revision stays as that version's record.
- **Duplicates and alt text:** submitting compares the text with every draft and approved question (letter trigrams;
  `asmt.bank.duplicate_percent`, default 90); a reviewer must mark "not a duplicate" before approving. Every image (question
  and options) needs alt text before submit and approval.
- **Translations (2010):** `asmt.languages` (Hindi, Tamil, Telugu; none by default, so English only). A translation is of
  the current version, all options in order, optionally marked AI-assisted, and approved by someone other than its writer.
- **Packs (2017):** only the switch, `asmt.packs` (Aptitude, English, Core IT; all on by default). The Library packs tab
  shows which are on and that YukthiX is writing them. No pack content.
- **Item analysis (PRC-05):** the older engine's statistics (from 20 answers) across tests, with the provisional band
  `asmt.item_stats.provisional_answers` (default 200) and each item's distractors.
- **Screens:** the designed `QuestionBankScreen`, `QuestionEditorScreen`, `QuestionReviewQueueScreen` and
  `ItemAnalysisScreen` with `live` (`bank-live.tsx`, export `@yukthix/ui/assessments`); new states drawn as stories in
  PRC-01 (3), PRC-02 (6), PRC-03 (3) and PRC-05 (2). The four left the design-live guard's "not live" list.
- **Security:** answer keys only for writers in their own session (`withoutAnswerKey` on the question and queue routes);
  every write refused while acting for someone else; every write audited (`question.created`, `change_drafted`,
  `submitted`, `change_withdrawn`, `duplicate_cleared`, `first_approval`, `approved`, `changes_requested`,
  `translation_drafted`, `translation_submitted`, `translation_approved`, `translation_changes_requested`).
- **Not built here:** see questions 2121 to 2130 (the older routes still publish without review, attempts do not record
  their version, image upload and media blocks, code-test editing, per-test reliability charts).
- **Tests:** API unit `bank-rules` (6); e2e `question-bank-review` (12); kit `bank-live` (14); web
  `yx-assessments-bank` (4). Manual test MT-ASMT-BANK1.

### Questions (from 2121)

2121. **The older question routes skip review.** `/questions` create, change and publish (the `/v2/questions` page, bulk
      upload and AI drafts) still make a question usable without another person. *Suggested: when the bank goes in the
      menu, the older publish refuses and changes to an approved question go through review; `/v2/questions` redirects.*
2122. **Which version an attempt saw.** Attempts and answers do not record the question version, and the engine changes
      the question row in place on approval. *Suggested: AS-0 or AS-4a stores the version on each answer (AS-0 already
      touches the answers table); reports read that version's record from the review history.*
2123. **The second-approver setting's shape.** Built as a comma list `asmt.bank.second_approver_collections`; the 6.5
      design draws "Review workflow per collection" (`asmt.review_workflow`). *Suggested: AS-2's 6.5 page writes this key
      as that list.*
2124. **Starter packs on by default.** `asmt.packs` has all three on though no pack content exists yet. *Suggested: keep;
      the tab says they are being written.*
2125. **Code, file and spoken questions in the editor.** It writes single choice, multiple choice, true or false and
      descriptive; the others keep their tests and settings. *Suggested: add code-test editing to the designed editor
      next.*
2126. **Media blocks.** The design draws LaTeX, code, audio, video and attachment blocks and an expected time; the engine
      holds one image per question and option (alt text built). *Suggested: image upload in the editor next, using the
      existing image route; the other blocks later.*
2127. **Per-test item analysis.** The design's reliability, score distribution, section correlation and item curves are
      per test; the engine computes per question across tests. *Suggested: with AS-2's test builder.*
2128. **Retiring questions.** Bulk Retire uses the older archive route with no review. *Suggested: keep; retiring only
      stops new tests using it.*
2129. **Telling reviewers.** Only the author is told (changes asked for). *Suggested: a daily bell note to bank writers
      when changes wait for them.*
2130. **Duplicate check scope.** Text only, within the company, drafts and approved questions. *Suggested: keep; add
      options to the comparison if reviewers see misses.*

**Founder answers (16 Nov 2026, "ok for all"), 2141 to 2145:** all as suggested.
- 2141: the older POST /questions creates a draft in the review queue too; move the suites over in one change.
- 2142: fixed sections take only approved questions; publishing a test refuses a draft.
- 2143: show question images in the candidate preview through a short-lived signed link.
- 2144: keep, the keys decide bank access when assessments.enabled is off.
- 2145: keep, the daily note follows the person's notification settings.

## AS-4b as built (branch `feat/yukthix-assessments-as4b`, 16 Nov 2026)

Before the test: answers 2011 and 2164. Built on AS-4a (its branch is merged into this one: the runner settings, the
offline credit and `asmt.time_credit_cap`). Staff pages not in the menu yet (as AS-1): `/yx/hiring/assessments/accommodations`
and `/connectivity`. Candidate pages `/accommodation` and `/readiness`, linked from `/welcome`.

- **Data:** migration `202617z0000321_asmt_before_test`. `accommodation_requests` (kinds, extra time, the candidate's
  words, the evidence file, the item-by-item decision and message; one open request per invitation; a decision always
  says who and when) and `connectivity_credits` (time lost above the cap, one open row per attempt; a decision needs a
  reason of 10+ characters). Both forced RLS, the company filled from the invitation or attempt by trigger, the app may
  not delete from them.
- **PRC-23 / PRC-11 (2011):** the candidate asks before the test (time 25, 50 or 100 %, breaks, screen-reader mode, font or
  contrast, a separate session, proctoring changes), with an optional PDF, JPG or PNG up to 10 MB checked by its first
  bytes (that one route takes a larger body). Test writers decide item by item; approved extra time becomes the
  invitation's (refused once the test has started); two people at once, the second is told. Extra time, screen-reader
  mode, larger font and the manual identity check apply automatically; breaks, a separate session and proctoring
  changes are noted for the test owner to arrange (2202). Evaluators and proctors never see the request or evidence.
- **PRC-24 manual path:** a candidate whose photo is required, who says no or whose photo fails, may ask for a manual
  identity check; once approved, `/welcome` lets them start without the photo.
- **PRC-10 (2011):** the AS-4a interceptor now counts a gap once (also guarded on when the attempt was last seen) and
  records time beyond the cap; a test writer or proctor approves it for a running test (the timer gives it back) or
  declines it, with a reason. An ended test cannot get time back.
- **PRC-22:** the candidate's computer checked in the browser for what the test needs (camera, displays, screen sharing,
  Safe Exam Browser, network delay, device), with fix steps; nothing saved.
- **2164:** "Approved for you" on `/welcome` and the request page; the designed runner shows "Screen-reader mode, approved
  for you" only when approved.
- **Screens:** the designed `AccommodationQueueScreen`, `ConnectivityPanelScreen`, `AccommodationRequestScreen` and
  `ReadinessCheckScreen` with `live`; stories PRC-10 (3), PRC-11 (2), PRC-22 (2), PRC-23 (3), PRC-26 (1). All four left
  the design-live guard's list. Measured at 1278 x 635: no blocks touch; every live screen scrolls less than its design.
- **Tests:** shared accommodation rules (5); runtime interceptor (6); kit `before-test-live` (11); web `readiness` (5),
  the two staff pages (2), the request page (2), `/welcome` (2 new); e2e `assessments-as4b` (13).

### Questions (from 2201)

2201. **The designed consent and selfie on `/welcome`.** The manual path is on the older welcome page; the designed
      consent ("what we record", with the company's retention from AS-2) and selfie steps are not switched in yet.
      *Suggested: switch `/welcome` to the designed steps with AS-4a part 2 (2161), the same way.*
2202. **Help that is noted, not applied.** Extra or longer breaks, a separate session and proctoring changes are recorded
      for the test owner but change nothing by themselves. *Suggested: per-invitation breaks and a "no gaze flags"
      profile next; a separate session waits for slot booking (AS-3).*
2203. **"Ask for more information".** The design has it; not built (the candidate would need to answer). *Suggested:
      the decision message covers it for now; add it with candidate notifications.*
2204. **Telling the candidate.** A decision is shown on the request page and `/welcome`, but no email is sent.
      *Suggested: an email on each decision, with what was approved.*
2205. **Face re-check before resuming.** The design asks for one after time above the cap is approved. *Suggested: with
      the live console (AS-5), which can pause.*
2206. **Who decides accommodations.** Test writers today (the test owner, answer 2011). *Suggested: keep; an HR / L&D
      reviewer comes with employee test-takers (2016).*
2207. **Evidence retention.** Evidence is kept with the invitation. *Suggested: delete it with the recordings, after the
      company's retention once the request is decided (AS-2's setting).*
