# Exam app ("Workfox") — reuse inventory against the YukthiX spec

**Prepared:** 24 Sep 2026 · **Codebase:** `D:\exam app` (read-only review, nothing modified) · **Spec:** `YukthiX/spec.md` §1.1, §1.2, §1.4, §2.1

## Executive summary

| Spec area | Bullets | Done | Partial | On branch | Missing |
|---|---|---|---|---|---|
| §1.1 Proctoring | 143 | 43 | 48 | 0 | 52 |
| §1.2 ATS | 36 | 14 | 7 | 0 | 15 |
| §1.4 Analytics | 8 | 1 | 3 | 0 | 4 |
| §2.1 Platform Foundation | 19 | 1 | 14 | 0 | 4 |

Rows marked "Not a spec bullet" are extra capabilities and are left out of these counts.

- **Which "main" was used.** Local `main` is 169 commits behind `origin/main` (last fetched 18 Sep). Local `main` has 81 Prisma models, which is the figure in spec D10. `origin/main` (`351971ec`, 15 Sep) has **93 models and 193 migrations**. This inventory uses `origin/main` as "main". Run `git fetch` and fast-forward local `main` before anyone works from it.
- **Nothing is only on a branch.** Every feature branch has been merged into `origin/main`, most of them squash-merged. The remaining unmerged branches are stale duplicates, docs, or dependency bumps (see §5).
- **Proctoring** is strong on browser proctoring, webcam and face checks, integrity flags, item analytics, and coding with auto-grading. **Missing:** adaptive testing and IRT, question versioning and review workflow, multi-language questions, a proprietary secure browser, ID-document checks, audio monitoring, video recording, proctor roles, and LMS integration.
- **ATS:** the internal ATS is largely built (requisitions and approvals, configurable pipelines, careers site, job boards, referrals, offers with e-accept, calendar sync). The **external/staffing ATS (§1.2.3) and the client helpdesk (§1.2.4) are essentially absent.**
- **Platform:** almost every foundation piece exists, but in a recruiting-shaped form. Approvals only cover the `requisition` and `offer` gates, custom fields only cover `candidate` and `job`, and billing is metered on candidates, AI credits and proctoring minutes. **Missing:** MFA, Google login, i18n, a mobile app/PWA, and a sandbox environment.

Status meanings: **Done** = on `origin/main` with evidence. **Partial** = on main but incomplete (the gap is stated). **On branch** = only on an unmerged branch. **Missing** = not found. "Unclear — verify" is used where the code alone cannot settle it.

---

## 1. §1.1 Proctoring

Main code locations: `apps/api/src/{questions,exams,invitations,reports,analytics,attempts-admin,drives,walk-in*,certificates,result-release,proctoring-retention,face-enrolment}`, `apps/exam-runtime/src/{attempts,grading,integrity,monitoring,face,code-execution,proctoring-analysis,leaderboard}`, `apps/web/app/(candidate)/*` and `apps/web/app/v2/(recruiter)/{questions,exams,reports,drives}`.

### Proctoring modes (Open / AI-only / Record-and-review / Live)
| Capability | Status | Evidence / gap |
|---|---|---|
| Mode declared per test | **Partial** | No mode enum. Behaviour is assembled from per-exam flags: `Exam.enableAntiCheating` (master switch), `webcamProctoringEnabled`, `webcamAiAnalysisEnabled`, `webcamRecordOnly`, `screenCaptureEnabled`, `lockdownRequired`, `proctoringEnforcement`, `proctoringStrikeLimit`, `disabledProctoringSignalsJson`. Live monitoring is available on any exam. |

### 1.1.1 Question Bank
| Capability | Status | Evidence / gap |
|---|---|---|
| Types: MCQ, multi-select, descriptive, coding, file upload, video | **Partial** | `create-question.dto.ts`: `single_mcq, multi_mcq, true_false, code, essay, file_upload, spoken` (audio). No **video** response type. |
| Skill/category taxonomy, hierarchical | **Partial** | `Question.topic`, `category` and `Tag` are flat strings. No domain → skill → sub-skill tree. |
| Difficulty on a fixed scale | **Done** | `difficulty` is `easy/medium/hard` and separate from `marks`. |
| Default marks, overridable per test | **Partial** | `Question.marks` exists. There is no per-test override; sections can be weighted instead (`ExamSection.weightPercent`). |
| Negative marks | **Done** | `Question.negativeMarks`; plan `phase-4a-question-tagging-negative-marking`. |
| Expected time per question | **Missing** | Only section-level `targetDurationMinutes`. |
| Tags | **Done** | `Tag`, `QuestionTag`, `GET /tags`. |
| Status draft/review/approved/retired | **Partial** | `active` / `archived`, plus AI drafts published with `POST /questions/:id/publish`. No review or approved states. |
| Versioning; live tests pinned | **Missing** | No question versions. Attempts snapshot their questions (`Attempt.sectionSnapshotJson`), and `answerKeyChangedAt` protects analytics, but edits change the question in place. |
| Usage statistics | **Done** | `analytics/item-analytics.*`, `packages/shared/src/analytics/item-statistics.ts`, `GET /analytics/questions/:id`. |
| Images in question body | **Done** | `Question.imageUrl`, `QuestionOption.imageUrl`, `POST /questions/images`. |
| Audio and video in question body | **Missing** | — |
| LaTeX | **Missing** | No KaTeX/MathJax in the web app. |
| Code snippets with highlighting | **Done** | `snippetCode`, `snippetLanguage`; plan `question-code-image-content`. |
| Attachments / reference material | **Missing** | — |
| Same question in multiple languages | **Missing** | `languageMode`/`allowedLanguages` are *programming* languages, not human languages. |
| Candidate picks language at start | **Missing** | — |
| Collections/folders with ownership | **Missing** | Only `createdBy`. |
| Author → reviewer → approver workflow | **Missing** | — |
| Bulk import / export | **Partial** | Import is done (`POST /questions/bulk-upload`, template endpoint). No bank export. |
| Duplicate detection | **Missing** | Duplicate detection exists for candidates, not questions. |
| Retirement without breaking history | **Done** | Archived questions stay in existing sections (Phase 1b rule) and in attempt snapshots. |

### 1.1.2 Test Builder
| Capability | Status | Evidence / gap |
|---|---|---|
| Fixed mode | **Done** | `ExamSection.selectionMode='fixed'`. |
| Randomised pool against a blueprint | **Done** | `selectionMode='pool'`, `poolSize`, `poolDifficulty`, `ExamSectionPoolTag`, `GET …/pool-preview`; plan `phase-4b-randomization-pool-selection`. |
| Adaptive mode | **Missing** | No adaptive logic anywhere. |
| Blueprint: questions per skill and difficulty | **Partial** | Possible only with one pool section per tag+difficulty combination. There is no blueprint object. |
| Total marks and pass mark | **Done** | `Exam.passCriteriaPercent`; section weights must sum to 100 before publish. |
| Duration, overall and sectional | **Partial** | `durationMinutes` is enforced. `targetDurationMinutes` is advisory and passed to the client, not enforced. |
| Adaptive rules (start, step, floor/ceiling, termination, pool depth) | **Missing** | — |
| Sections and sectional timing | **Partial** | Sections are done. Sectional timing is advisory only (see above). |
| Randomisation and pooling | **Done** | `randomizeOrder`, `Attempt.optionOrderJson`. |
| Negative marking | **Done** | Question-level. |
| Retake and reset policy | **Missing** | No retake or reset. Only resend or revoke invitation. |
| Navigation (forward-only vs free, review and flag) | **Partial** | Free navigation and `Answer.isMarkedForReview` are done (`QuestionNavigator.tsx`). No forward-only option. |
| "Answer any N" | **Done** | Not a spec bullet, but useful: `ExamSection.requiredCount`. |
| Templates / reusable library | **Partial** | `POST /exams/:id/duplicate` and section duplicate (plan `exam-templates-cloning`). No template library. |
| Versioning with publish approval | **Missing** | Publish and unpublish exist, with no versions and no approval. |
| Archive and retirement | **Partial** | Unpublish and delete exist. There is no archive state for exams. |

### 1.1.3 Coding Assessment
| Capability | Status | Evidence / gap |
|---|---|---|
| Languages and runtime versions | **Done** | Self-hosted Piston: `exam-runtime/src/code-execution/piston-*`, `GET /attempt/code-languages`, per-question `allowedLanguages`. |
| Visible and hidden test cases | **Done** | `Question.codeTestsJson` has a `hidden` flag per case. |
| Partial scoring by tests passed | **Done** | Per-case `weight`, in `grading/code-autograde.service.ts`. |
| Sandbox limits (CPU, memory, wall-clock, network) | **Partial** | 5 s run timeout plus `run-limiter.ts`. Other limits are left to Piston's own config (unclear — verify Piston deployment). |
| Editor features | **Partial** | Monaco with syntax highlighting and a fixed `vs-dark` theme. No autocomplete policy setting. |
| Compile/run history as integrity signal | **Partial** | `runCount` telemetry feeds the `no_iteration` flag (`integrity-rules.ts`). The full run history is not retained. |
| Database / SQL questions | **Missing** | — |
| AI code review for graders | **Done** | Not a spec bullet: `CodeAnswerReview`, `exam-runtime/src/code-review`. |

### 1.1.4 Scheduling & Invitations
| Capability | Status | Evidence / gap |
|---|---|---|
| Individual and bulk invites | **Done** | `POST exams/:examId/invitations`, `POST candidates/bulk-upload-invite`. |
| Access windows and deadlines | **Done** | `Exam.availabilityWindowStart/End`, `Invitation.expiresAt`; plan `exam-scheduling`. |
| Timezone handling | **Partial** | Times are stored in UTC. There is per-user timezone for staff (`User.timeZone`), but no candidate-local resolution and no authoring timezone on the test. |
| Reminders and missed-test alerts | **Partial** | Staff reminder sweep covers stale invites (`reminders`, `Organization.remindersEnabled`). No candidate-facing exam reminders. |
| Self-scheduling into slots | **Missing** | Self-booking exists for interviews only (`Interview.bookingMode`). |
| Rescheduling rules and limits | **Missing** | — |
| No-show handling | **Missing** | — |
| Drive mode, thousands concurrent | **Partial** | Hiring drives (`WalkInGroup`, `DriveSession`, `drives` module, live drive view) and walk-in registration exist. Only a k6 spike test backs the scale claim (`load/spike.js`). |
| Capacity and load planning | **Partial** | `load/` scripts only. No capacity tooling. |
| Low-connectivity / offline handling | **Missing** | — |
| Device policy per test | **Partial** | `Exam.lockdownRequired` (Safe Exam Browser) and `allowedIpRange`. There is no desktop-only vs any-device setting. |
| Mobile only where secure browser not required | **Missing** | — |

### 1.1.5 Pre-Test Experience
| Capability | Status | Evidence / gap |
|---|---|---|
| System readiness check | **Partial** | Camera permission and preview only (`welcome/page.tsx`, `CameraPreview.tsx`). No mic, bandwidth, CPU, browser-version or process checks. |
| Practice / demo test | **Done** | `PracticeStep.tsx`. |
| Instructions with acknowledgement | **Done** | `Exam.instructions`, `Attempt.consentAt`. |
| 360° room scan | **Missing** | — |
| Second-device phone camera | **Missing** | — |
| Consent capture | **Done** | `Attempt.consentAt`, `FaceEnrolment.consentAt`; declined consent is recorded. |

### 1.1.6 Proctoring Controls
| Capability | Status | Evidence / gap |
|---|---|---|
| Proprietary secure browser | **Partial** | Integrates the **third-party Safe Exam Browser**: `GET /attempt/seb-config` and ConfigKey header verification (plan `lockdown-browser`). No proprietary browser. |
| Kiosk mode | **Partial** | Provided by SEB. In a normal browser: fullscreen-exit and devtools detection. |
| VM / emulator detection | **Missing** | — |
| ID document verification | **Missing** | — |
| Face match against ID at start | **Partial** | Liveness-checked selfie enrolment at start (`FaceEnrolmentStep.tsx`, `face-liveness.ts`). It is not compared against an ID document. |
| Periodic re-authentication | **Done** | Server-side face verification and mismatch voter (`exam-runtime/src/face/*`), with `faceMismatchAction` = flag/warn/pause/block (stage 3, PR #103). |
| Face and multiple-person detection | **Done** | `no_face`, `multiple_faces`, `head_turned` (webcam-violation DTO); optional vision-AI review (`webcamAiAnalysisEnabled`). |
| Audio monitoring | **Missing** | — |
| Tab-switch / focus detection | **Done** | `tab_switch`, `window_blur` (`proctoring-severity.ts`). |
| Copy / paste / print blocking | **Partial** | Copy/paste and right-click are detected and count as strikes. Print only has an `@media print` rule (unclear — verify blocking). |
| Screenshot / screen-recording blocking | **Missing** | A browser cannot do this (SEB partially can). |
| Conferencing-app detection | **Partial** | AI screen analysis of the shared screen flags visible apps (`background_app_detected`). No process-level detection. |
| Remote-control tool detection | **Partial** | `remote_access_suspected` from AI screen analysis (plan `external-tool-screen-share-detection`). Flag only. |
| Screen mirroring / casting | **Missing** | — |
| Multiple-display detection | **Done** | `multi_monitor_detected` (strike-worthy). |
| Virtual camera / audio driver detection | **Missing** | — |
| Blocked-process list | **Missing** | Only via SEB configuration. |
| Configurable action per detection | **Partial** | Per-exam `proctoringEnforcement` (block/…), strike limit, per-signal disable list, `webcamRecordOnly`, face action. There is no free-form per-detection action matrix. |

### 1.1.7 AI-Assistance Detection
| Capability | Status | Evidence / gap |
|---|---|---|
| Response-time anomaly detection | **Missing** | — |
| Typing and paste-pattern analysis | **Done** | `Answer.telemetryJson`; flags `large_paste`, `paste_dominant`, `no_iteration` (`integrity-rules.ts`). |
| Stylometric comparison vs LLM output | **Missing** | — |
| Second-device detection on local network | **Missing** | — |
| Follow-up probe questions | **Missing** | — |
| Weighted flags, never an automatic fail | **Done** | `IntegrityAnalysis.level` = clear/review/high_concern. AI signals are explicitly not strike-worthy. Calibrated in plan `integrity-signal-calibration`. |

### 1.1.8 Session Continuity
| Capability | Status | Evidence / gap |
|---|---|---|
| Auto-save every answer | **Done** | `POST /attempt/answer`, one `Answer` row per question. |
| Recovery after power or network loss | **Done** | `GET /attempt/current` resumes, with the order kept in `questionOrderJson`. |
| Time credit for lost time | **Missing** | The server clock keeps running. Only proctoring pauses freeze the timer (`pausedDurationMs`). |
| Admin-approved resume with re-auth | **Partial** | `POST /attempts/:id/unblock` exists. No re-authentication step. |
| Scheduled / unscheduled breaks | **Missing** | — |

### 1.1.9 Monitoring & Review
| Capability | Status | Evidence / gap |
|---|---|---|
| Invigilator multi-candidate dashboard | **Done** | `exam-runtime/src/monitoring/monitoring.gateway.ts` (WebSocket), `LiveMonitoringPanel.tsx`. |
| Chat / intervention | **Done** | `CandidateMessage`, `POST /attempts/:id/message`. |
| Pause or terminate a session | **Partial** | Force-submit and unblock exist. There is no proctor-initiated pause. |
| Recording (screen, camera, audio) | **Partial** | Periodic **still images** only (webcam snapshots and screen captures to blob). No video, no audio. |
| Playback jumping to flagged segments | **Partial** | Event timeline plus screen-capture viewer. No video to seek through. |
| Proctor accounts and roles | **Missing** | Recruiters monitor. There is no proctor role. |
| Assignment, capacity, shifts | **Missing** | — |
| Recording retention per tenant | **Partial** | Nightly 90-day retention sweeps (`proctoring-retention`, `face-retention`), but the value is hard-coded and not per tenant. |
| Data residency per tenant | **Partial** | `Organization.region` column only. There is no regional deployment routing. |
| Chain of custody on evidence | **Missing** | — |

### 1.1.10 Integrity Checks
| Capability | Status | Evidence / gap |
|---|---|---|
| Plagiarism vs external sources | **Missing** | — |
| Code-similarity detection | **Done** | `exam-runtime/src/integrity/similarity.ts` (5-gram Jaccard across attempts). |
| Cohort collusion (answer patterns) | **Partial** | Covers code only. No MCQ answer-pattern similarity. |
| Question exposure monitoring | **Missing** | — |

### 1.1.11 Incident Management
| Capability | Status | Evidence / gap |
|---|---|---|
| Violation taxonomy with severity | **Done** | `proctoring-severity.ts` (low/medium/high, strike-worthy set). |
| Evidence bundle per incident | **Partial** | Events, snapshots and captures are stored with timestamps. There is no incident object or bundle, and no clips. |
| Reviewer queue and verdict | **Partial** | Grading queue and integrity panel exist. No incident verdict workflow. |
| Override with recorded reason | **Partial** | Proctoring bypass with reason (`Attempt.proctoringBypassReason`). Not a general override mechanism. |
| Candidate appeal | **Missing** | — |
| Tamper-evident audit trail | **Partial** | `audit_logs` is append-only (SQL Server `INSTEAD OF DELETE` trigger). No hash chain. |

### 1.1.12 Scoring & Outcomes
| Capability | Status | Evidence / gap |
|---|---|---|
| Objective auto-scoring | **Done** | `exam-runtime/src/grading`; partial credit for multi-MCQ. |
| Comparable adaptive scoring | **Missing** | — |
| Percentile and cut-offs | **Done** | Leaderboard percentile (`leaderboard.service.ts`), pass percentage. |
| Skill-level breakdown | **Partial** | Section scores (`reports.service.ts` `sectionScores`). Not broken down by skill or tag. |
| Rubric-based manual evaluation | **Partial** | Manual grading with feedback and `modelAnswer`. No rubric object. |
| Multiple evaluators per response | **Missing** | — |
| Blind evaluation / inter-rater checks | **Missing** | — |
| Score report, configurable visibility | **Done** | `feedbackVisibility`, `resultsReleaseMode`, per-attempt release/hold. |
| Cohort comparison | **Done** | `GET exams/:id/candidates/compare`, drive results. |
| Auto-shortlist into ATS | **Partial** | Exams link to jobs (`JobExam`) and results show on the pipeline board. Blueprint rule `exam_passed` can *gate* a stage move. No automatic advance. |
| Certificates | **Done** | `CertificateTemplate`, PDF, public verify page `/verify/[id]`. |

### 1.1.13 Psychometrics & Item Analysis
| Capability | Status | Evidence / gap |
|---|---|---|
| Difficulty and discrimination index | **Done** | `item-statistics.ts` (p-value, point-biserial), `difficulty-calibration.ts`. |
| Distractor analysis | **Done** | Same module (distractor-beats-key flag). |
| Cronbach's alpha | **Missing** | — |
| IRT calibration | **Missing** | — |
| Exposure control | **Missing** | — |

### 1.1.14 Accessibility & Accommodations
| Capability | Status | Evidence / gap |
|---|---|---|
| Screen reader compatibility | **Partial** | ARIA attributes on candidate components. No audit found (unclear — verify). |
| Extra-time accommodation | **Done** | `Invitation.extraTimePercent`, `POST invitations/:id/accommodation`. |
| Font scaling and contrast | **Missing** | — |
| Keyboard-only navigation | **Partial** | Unclear — verify. No explicit keyboard support found beyond standard controls. |
| Accommodation request / approval process | **Missing** | Recruiters set extra time directly. |

### 1.1.15 Privacy, Consent & Fairness
| Capability | Status | Evidence / gap |
|---|---|---|
| Explicit, granular biometric consent | **Done** | Face-enrolment consent (declines recorded), attempt consent. |
| Stated retention with automatic deletion | **Partial** | Automatic 90-day deletion exists. Not configurable, and not shown to the candidate as a retention period (unclear — verify copy). |
| Lawful basis per jurisdiction | **Missing** | — |
| Withdraw and erasure | **Partial** | Erasure and export done (`POST candidates/:id/erase`, `GET candidates/:id/export`, including face data). No candidate self-service withdrawal. |
| Manual fallback when face detection fails | **Done** | `faceEnrolmentPolicy` (`retry_then_allow`, allow unenrolled). Failures are flagged, not blocked. |
| Published accuracy testing across demographics | **Missing** | — |
| No auto-fail on a biometric signal alone | **Done** | Face mismatch is not strike-worthy and defaults to `flag`. Admins *can* configure pause/block. |

### 1.1.16 Integrations
| Capability | Status | Evidence / gap |
|---|---|---|
| Auto-shortlist into ATS | **Partial** | Same as 1.1.12. |
| LMS via SCORM / xAPI | **Missing** | — |
| Certificate issue → §1.3.9 | **Partial** | Certificates exist, but are tied to exam attempts. No HRMS learning link. |

---

## 2. §1.2 ATS

Code: `apps/api/src/{pipeline,candidates,candidate-*,public-applications,interviews,offers,approvals,referrals,internal-applications,job-boards,easy-apply,agencies,agency-*,drip,surveys,calendar-sync,hris,analytics}`; web `v2/(recruiter)/{jobs,candidates,approvals,calendar,referrals,internal-mobility,campaigns,surveys,agency-submissions,analytics/hiring}`, `careers/[orgSlug]`, `(candidate)/{apply,portal,interview,offer}`.

### 1.2.1 Shared Capabilities
| Capability | Status | Evidence / gap |
|---|---|---|
| Resume parsing | **Done** | `jobs/processors/resume-parse.processor.ts`, `CandidateProfile.parsed*`, `POST public/jobs/:applyToken/parse-resume` (autofill). |
| Deduplication | **Done** | `GET candidates/duplicates` (embeddings), unique (org, email), `AgencySubmission.isDuplicate`. |
| Candidate merge | **Missing** | — |
| Talent pool | **Done** | `Candidate.globalStage` (incl. `available`), semantic search `POST candidates/search`, drip campaigns. |
| Hotlist | **Missing** | — |
| Bench | **Missing** | Staffing concept, not modelled. |
| Candidate portal (status, document upload) | **Partial** | Magic-link portal `/portal/[portalToken]` with status, profile edit, résumé replace, open jobs. No multi-document store. |
| Candidate consent and retention | **Partial** | Apply consent with versioning (`applyConsentText`, `Candidate.consentedAt`), erase and export, unsubscribe. No automatic candidate-data retention deletion. |
| Scheduling with panel availability + calendar sync | **Done** | `calendar-sync` (Google and Microsoft OAuth, free/busy, Meet/Teams links), `InterviewSlot`, candidate self-booking. |
| AI-conducted first round | **Missing** | The "AI interview kit" only generates questions and turns notes into a scorecard (`interviews/interview-ai.controller.ts`). |
| Panel interviews, scorecards, feedback | **Done** | `InterviewPanelist`, `PipelineFeedback` (rating + note), panel console `v2/panel/*`. |
| Templates and bulk actions | **Done** | Email/SMS/WhatsApp templates with stage triggers, `bulk-candidate-email`, `POST entries/bulk`. |
| Background verification integration | **Missing** | — |
| Recruiter productivity and pipeline dashboards | **Partial** | Pipeline funnel, time-to-hire and sources are done (`GET analytics/hiring`, dashboard). No per-recruiter productivity view. |

### 1.2.2 Internal ATS
| Capability | Status | Evidence / gap |
|---|---|---|
| Step 1 — department head opens a position | **Partial** | `hiring_manager` role and requisitions with an approval gate (`POST jobs/:id/submit`). `Job.department` is a free-text string; there is no Department entity. |
| Steps 2–3 — source, screen, shortlist | **Done** | Pipeline board, AI candidate-fit scoring (`candidate-fit`), assignment. |
| Step 4 — AI round-one interview | **Missing** | Same as 1.2.1. |
| Step 5 — panel round two | **Done** | Interviews with panelists. |
| Requisition against approved headcount budget | **Partial** | `Job.headcount` and salary range with requisition approval. No headcount plan or budget. |
| Branded career page per tenant | **Done** | `/careers/[orgSlug]`, careers settings, optional AI careers assistant. |
| Job board posting and distribution | **Done** | XML feeds plus LinkedIn/Indeed/HTTP push adapters (`job-boards/providers`). These stay inactive until an org adds credentials. Easy Apply ingestion (`easy-apply`). |
| Employee referral management | **Done** | `Referral` with a reward lifecycle, `v2/(recruiter)/referrals`. |
| Offer management, approval, letter generation | **Done** | `Offer`, named `OfferTemplate`s, PDF, offer approval gate, public accept/decline. |
| Handoff on offer acceptance → §1.3.2 | **Partial** | On hire, pushes to an *external* HRIS (`hris` module: generic, BambooHR, Workday, Greenhouse, Lever). There is no internal employee creation. |
| Internal mobility | **Done** | Not a spec bullet, but relevant to HRMS: `internal-applications` (staff self-apply). |

### 1.2.3 External ATS
| Capability | Status | Evidence / gap |
|---|---|---|
| Register customer (name, contacts, source) | **Missing** | There is no Client/Customer model. `Agency` is the opposite direction (inbound vendors, which the spec puts out of scope). |
| Register jobs under customer | **Missing** | `Job` has no customer link. |
| Source candidates against a job, attach CV | **Done** | Generic pipeline and résumé upload. |
| Submit to customer contact by email (single / bulk) | **Missing** | — |
| Conduct interviews | **Done** | Generic interviews. |
| Track status through submission → interview → outcome | **Partial** | The configurable pipeline could model it. There is no client-submission entity or client-side view. |
| Rate cards, margin, commission | **Missing** | — |
| Contract and placement management | **Missing** | — |
| Contractor / deployed-employee lifecycle | **Missing** | — |
| Timesheet → invoice → billing | **Missing** | — |
| Client SLA tracking | **Missing** | Business hours and holidays exist (`Organization.businessHoursJson`) and could underpin SLAs. |

### 1.2.4 Client Helpdesk
| Capability | Status | Evidence / gap |
|---|---|---|
| Ticketing for external customers | **Missing** | — |

---

## 3. §1.4 Analytics

| Capability | Status | Evidence / gap |
|---|---|---|
| 1.4.1 Report builder | **Missing** | Fixed reports only. |
| 1.4.2 Role-based dashboards | **Partial** | Recruiter dashboard and Today home (`GET dashboard/*`), platform console. No HR, department-head or executive dashboards. |
| 1.4.3 Scheduled reports and exports | **Partial** | Weekly digest email (`scheduled-reports`); CSV/XLSX/PDF exam-result exports (`reports/exporters`); audit CSV. No subscriptions per report, and no generic Excel/PDF export. |
| 1.4.4 Assessment analytics | **Done** | Summary, question accuracy, item analytics, integrity dashboard. |
| 1.4.5 Recruitment analytics | **Partial** | Funnel, time-to-hire and source are done, plus an AI funnel narrative. No cost-per-hire or offer-acceptance metric (unclear — verify). |
| 1.4.6 Staffing and revenue | **Missing** | — |
| 1.4.7 Workforce | **Missing** | Not applicable to this codebase. |
| 1.4.8 Payroll and compliance | **Missing** | Not applicable (counted as Missing). |

---

## 4. §2.1 Platform Foundation

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| 2.1.1 | Tenant and organisation setup | **Partial** | `Organization` has name, slug, region, branding, business hours, holidays, plus a first-run setup wizard (`setup`). **No** legal entities, locations, departments, designations or grades. |
| 2.1.2 | Authentication and security | **Partial** | Done: email/password (Argon2id), JWT with refresh rotation and reuse detection, forgot/reset password, per-org SAML (`@node-saml/passport-saml`, which also covers Entra through SAML), impersonation, super-admin switch-into, HSTS and secure cookies, encrypted org secrets (AES-256-GCM `OrgSecretsCryptoService`). **Missing:** MFA, Google login, Entra OIDC, staff IP allow-list (IP ranges are exam-level only), active-session list. Login history is audit events plus `lastLoginAt`. |
| 2.1.3 | RBAC and data visibility | **Partial** | Done: permission catalogue (`permissions`, seeded role defaults), per-org role overrides (`OrgRolePermission`), custom `PermissionProfile`s, field-level permissions (hidden/read-only). **Gap:** record-level visibility only covers `pipeline_entries` for the `recruiter` role. |
| 2.1.4 | Workflow and approval engine | **Partial** | `ApprovalChain` / `Step` / `Request` / `Decision` with approver types users, reporting manager (N levels), hiring manager and group, plus snapshots and email templates. **Only two gates** (`requisition`, `offer`); `subjectType` is job or offer. |
| 2.1.5 | Custom fields and form builder | **Partial** | `CustomFieldDefinition` / `Value` (EAV, typed values, required, `showOnApply`). Entity types are limited to `candidate` and `job` in the DTO. No form or layout builder. |
| 2.1.6 | Localisation | **Missing** | Per-user timezone and a job salary currency only. No i18n, no multi-currency, no statutory packs. |
| 2.1.7 | Notification engine | **Partial** | In-app `UserNotification` with per-type email preferences and a daily digest. Email (per-org SMTP, sender addresses). SMS (Twilio + generic HTTP provider). WhatsApp (Twilio). Per-tenant templates. Channels are separate modules, not one engine, and SMS/WhatsApp only reach candidates. |
| 2.1.8 | Document management and e-signature | **Partial** | Private blob storage with SAS links, résumés, offer PDFs, click-to-accept offers. No DMS, versioning, per-document ACL or real e-signature. |
| 2.1.9 | Letter and template generator | **Partial** | Offer letters (named templates with merge fields, PDF) and certificates. No relieving, experience or other letters. |
| 2.1.10 | Global search | **Missing** | Only candidate semantic search and server-side picker search. |
| 2.1.11 | Import, export and migration | **Partial** | Bulk question upload, bulk candidate invite, bulk users, result/audit/job CSV exports, GDPR export. No generic importer or migration tooling. |
| 2.1.12 | Open API and webhooks | **Partial** | Public API with a per-org API key (hashed): **read-only** `public/exams`, `public/candidates`, `public/invitations`, results (`docs/public-api.md`). Signed webhooks with a delivery log. Per-endpoint daily usage metering (`ApiUsageDaily`). No write API and only one key per org. |
| 2.1.13 | Integration hub | **Partial** | Google/Microsoft calendar, Slack/Teams/Zapier connected apps (`integrations`), HRIS export connectors, job boards, Easy Apply. **Missing:** accounting, biometric devices, BGV, mail inbox sync. |
| 2.1.14 | AI layer | **Partial** | Per-org bring-your-own key (`aiApiKeyEncrypted`, `aiProvider` = Anthropic or OpenAI-compatible, `aiModelFast/Standard`), separate BYO embeddings key, `AiCreditUsage` per `source`, plan AI-credit limits. Providers live in `packages/shared/src/ai`. No response caching and no routing beyond fast/standard. |
| 2.1.15 | Audit log | **Done** | `AuditLog` (actor snapshot, metadata), DB append-only trigger, admin UI `v2/(org-admin)/audit-log`, CSV export, plan `phase-6c-audit-log-access-review`. |
| 2.1.16 | Privacy and data governance | **Partial** | Consent capture, erase/export, unsubscribe, opt-outs, retention sweeps (proctoring, face, recycle bin, API usage, system events). Candidate-centric only, retention is hard-coded, and residency is a column only. |
| 2.1.17 | Billing and subscription | **Partial** | `Plan` (seats, candidates, AI credits, proctoring minutes), usage meters, threshold notices (`BillingNotice`), Stripe checkout, portal, invoices and webhook. Dunning is minimal (Stripe status only). |
| 2.1.18 | Mobile app / PWA | **Missing** | No manifest or service worker. |
| 2.1.19 | Sandbox environment | **Missing** | — |

Other platform pieces not in the spec list but on main: `recycle-bin` (soft delete for Candidate, Job, Pipeline and WalkInGroup, restore, retention purge), `user-groups`, business hours and holidays, per-user timezone and signature, `system-events` (error log UI), white-label branding, landing page and lead capture, a super-admin platform console, and Stripe plans.

---

## 5. Branches not merged into main

Baseline is `origin/main` @ `351971ec` (15 Sep 2026). Against the stale local `main`, `git branch -a --no-merged main` lists **112** refs. **93 of them are already merged into `origin/main`**, so local `main` simply needs a fast-forward. The **19** refs not merged into `origin/main` are below.

Merge status was also checked with `git cherry`, and against squash-merge PR titles, to catch branches merged under different commits. **There are no `integration/*` branches.** The `feat/integrations-{calendar-ics,chat,zapier}` branches are all merged.

| Branch | Last commit | What it contains | Status vs origin/main | Recommendation |
|---|---|---|---|---|
| `feat/careers-site` (**current checkout**) | 2026-09-08 | Careers settings page | Merged (0 ahead, 278 behind). **7 uncommitted files**: v2 dashboard, AppShell, Sidebar, TopBar, IconStatCard, `v2.css`, `docs/ats/zoho-adopt-inventory.md` | **Needs review.** Decide whether the uncommitted UI tweaks are wanted, then move them to a fresh branch off `origin/main`. |
| `feat/face-identification-stage-1` (+ `origin/`) | 2026-08-11 | Face-ID enrolment | Squash-merged as PR #13 (`c283c578`) | Drop |
| `feat/face-identification-stage-1-rebased` (+ `origin/`) | 2026-08-11 | Same, rebased | Squash-merged as #13 | Drop |
| `feat/face-identification-stage-2` | 2026-08-12 | Server-side face verification | Squash-merged as #24 (`eda3c179`) | Drop |
| `feat/grading-tab-activity-insights` (+ `origin/`) | 2026-08-11 | Tab-activity insights in grading | Squash-merged as #12 (`0e3d8f8c`) | Drop |
| `feat/ai-question-generation-stage-1` | 2026-08-13 | AI generation drafts review | Squash-merged as #25 (`0b66bdad`) | Drop |
| `origin/fix/screen-analysis-tab-detection` | 2026-08-11 | Screen-analysis bookmark fix | Squash-merged as #14 (`b49f0b92`) | Drop |
| `origin/fix/rxjs-workspace-consistent-bump` | 2026-08-11 | rxjs dedupe | Patch-equivalent in #15 | Drop |
| `feat/staff-users-admin-console` | 2026-07-31 | Staff users console | All 26 commits patch-equivalent on main | Drop |
| `feat/post-ui-v2` | 2026-09-04 | One test assertion | Patch-equivalent on main (local branch is 4 ahead of its remote) | Drop |
| `claude/exciting-saha-573f99` | 2026-08-01 | Hermetic SMTP env in `email.service.spec.ts` | Superseded (main has its own env-restore logic) | Drop |
| `feat/grouped-sidebar` | 2026-09-09 | **Docs only**: grouped-sidebar design spec and plan | Not on main (`feat/sidebar-sections` was merged separately) | **Park.** Check whether the uncommitted `Sidebar.tsx` work is its implementation. |
| `origin/dependabot/…/nestjs/core-11.2.3` | 2026-09-11 | @nestjs/core bump | Open | Merge after CI (bump core, platform-express and platform-socket.io together) |
| `origin/dependabot/…/nestjs/platform-express-11.2.3` | 2026-09-11 | Bump | Open | Merge (with the above) |
| `origin/dependabot/…/nestjs/platform-socket.io-11.2.3` | 2026-09-11 | Bump | Open | Merge (with the above) |
| `origin/dependabot/…/tanstack/react-query-5.102.8` | 2026-09-11 | Bump | Open | Merge after CI |
| `origin/dependabot/…/monaco-editor-0.56.0` | 2026-09-11 | Bump | Open | **Drop / ignore.** The deploy runbook pins monaco at 0.52.2 because 0.55.x breaks the self-hosted editor. |

Net: **no feature work is stranded on branches.** Housekeeping: fast-forward local `main`, delete about 11 merged or superseded branches, and settle the uncommitted changes on `feat/careers-site`.

---

## 6. Reusable for HRMS

Most of the platform lives in `packages/shared/src` (tenant Prisma, audit, crypto, AI providers, blob storage, billing core, field-permissions, record-visibility, approvals types, analytics) and `apps/api/src`.

| Piece | Where | How generic | What needs generalising for HRMS |
|---|---|---|---|
| **Tenancy / RLS** | `packages/shared/src/prisma/tenant-prisma.service.ts` (`forTenant`, `withoutTenantScope`, `forTenantIncludingDeleted`); RLS function `fn_tenant_access_predicate` and `TenantAccessPolicy` across 61 tables | **Very generic.** An org key on every row, fail-closed, soft-delete aware. | Must be rewritten for PostgreSQL (§7). Child tables such as `attempts`, `answers`, `invitations`, `results` and `proctoring_events` have **no** org column and **no** RLS; they rely on service-layer parent checks. HRMS should put `tenant_id` on every table, as D3 says. |
| **RBAC and permission profiles** | `apps/api/src/rbac/*`, `permission-profiles`, seed `apps/api/prisma/seed.ts` (63 permission keys) | Mechanism is generic: permission keys, guard, per-org overrides, custom profiles. | **Roles are hard-coded** in `rbac/roles.ts` (`org_admin, hiring_manager, recruiter, panel, auditor` plus `super_admin`), and `EDITABLE_ROLES = hiring_manager/recruiter/panel`. There is **no employee or manager role**. HRMS needs data-driven roles and HR permission keys. |
| **Field permissions** | `packages/shared/src/field-permissions`, `Organization.fieldPermissionsJson`, `PermissionProfile.fieldPermissionsJson` | Pattern is generic. | `GOVERNED_FIELDS` is a fixed map of candidate and job fields, and `GOVERNABLE_ROLES` is fixed. Needs an entity and field registry. |
| **Record visibility** | `packages/shared/src/record-visibility`, `record_visibility_rls` migration | **Narrow.** Only `pipeline_entries`, only the `recruiter` role, assignment by user or group. | HRMS needs a manager-hierarchy scope (`User.managerId` exists) across many entities. Best treated as a design reference. |
| **User groups** | `user-groups` module, `UserGroup` / `UserGroupMember` | Generic | Reuse directly. |
| **Audit** | `packages/shared/src/audit`, `AuditLog` | Generic (`entityType` / `entityId`, actor snapshot, metadata) | Reuse. Replace the SQL Server append-only trigger with a PostgreSQL rule, trigger or grant. Consider a hash chain if tamper evidence is required. |
| **Approval chains** | `apps/api/src/approvals`, `packages/shared/src/approvals/approval-types.ts` | Engine is reasonably generic: steps, approver types including reporting-manager levels and groups, snapshot, decisions, email templates. | `gate` is limited to `'requisition' \| 'offer'` and `subjectType` to job or offer. **One chain per org per gate**, with no conditions or amount rules. Generalise to registered gates, conditional chains and delegation (the Zoho notes mention delegation). |
| **Notifications** | `notifications` (in-app, per-type email prefs, digest), `email` (per-org SMTP, `OrgSenderAddress`), `sms` (Twilio + HTTP), `whatsapp`, `candidate-*` template modules | Building blocks are generic. Orchestration is **candidate-specific**. | There is no single "notify(recipient, event, channels)" engine. SMS and WhatsApp only address `Candidate` rows (`CandidateSms`, `CandidateWhatsapp`), and templates are per purpose. HRMS needs a unified engine for employees. |
| **Custom fields** | `custom-fields`, `CustomFieldDefinition` / `Value` | EAV storage is generic (`entityType NVARCHAR(20)`) | DTO restricts `CF_ENTITY_TYPES = ['candidate','job']`. Widen to employee and other entities, and add a form or layout layer. |
| **Recycle bin** | `recycle-bin`, `packages/shared/src/soft-delete/soft-delete.extension.ts` | Generic mechanism (Prisma extension plus `deletedAt` / `deletedByUserId`) | Entity list is fixed (Candidate, Job, Pipeline, WalkInGroup). Register HRMS entities. |
| **Webhooks** | `webhooks` (signed, delivery log, BullMQ retries), `integrations` (connected apps: Slack, Teams, Zapier, HTTP, with an allow-list) | Generic transport | Event catalogue is ATS/exam events. Only one webhook URL per org. |
| **Public API** | `public-api`, `docs/public-api.md`, `api-usage` | Pattern is reusable (API-key guard, rate-limit tiers, daily metering) | Read-only, exam/candidate resources only, one key per org. |
| **Billing / plans / entitlements** | `billing`, `packages/shared/src/billing/billing-core.ts`, `Plan`, `BillingNotice`, Stripe | Stripe plumbing is generic | Plan dimensions are **hard-coded columns** (`candidateLimit`, `aiCreditLimit`, `proctoringMinutesLimit`, `seatLimit`). HRMS needs per-module entitlements and employee-count pricing. Stripe does not suit Indian SMBs well (consider Razorpay). |
| **AI provider and credit metering** | `packages/shared/src/ai/*` (Anthropic, OpenAI-compatible, embeddings), `crypto/ai-api-key-resolver.service.ts`, `AiCreditUsage`, exam-runtime `billing/quota.service.ts` | **Generic.** Matches D2 and the §2.1.14 BYO-key requirement. | Add caching and model routing if needed. `source` is a free string, so it is already generic. |
| **SSO** | `auth/saml.*`, `SsoLoginCode`, per-org SAML columns on `Organization` | Generic for staff | Add OIDC (Google, Entra) and MFA. Only one IdP per org. |
| **GDPR / consent** | `candidates` erase/export, apply consent, unsubscribe, `data-rights` page | **Candidate-specific** | Employees need their own consent, retention and erasure rules (statutory records cannot always be erased). |
| **Business hours and holidays** | `Organization.businessHoursJson`, `holidaysJson`, `GET/PATCH organizations/business-hours` | One calendar per org, stored as JSON | HRMS needs per-location holiday lists, shifts and weekly-off patterns as proper tables. Treat this as a reference only. |
| **File storage** | `packages/shared/src/storage/blob-storage.service.ts` | Private container, SAS links, content-type allow-list | **Azure Blob-specific** (`@azure/storage-blob`). D4 requires S3-compatible storage, so put it behind an interface or swap to the S3 SDK. |
| **Background jobs** | `apps/api/src/jobs/*` (BullMQ queues: ai-jobs, webhook, integration, hris-exports, and a cron `scheduled-sweeps` queue with 10 sweeps) | Generic; matches D2 | Workers run in-process inside `apps/api`. Split into a worker process for HRMS payroll loads. |
| **Observability** | Sentry (all three apps, with source maps), `SystemEvent` table and admin UI, `/health` endpoints, fail-open throttler | Generic | No OpenTelemetry tracing or central logs yet. |
| **Identity model: Candidate vs Employee** | Staff = `User` (email+password or SAML, `role` string, `managerId`, `organizationId` nullable for super-admin). Candidate = `Candidate` per org, **no password**. Exam access through an invitation-token redeem that issues a candidate JWT scoped to one invitation (`exam-runtime/src/candidate-auth`). The portal uses a `portalToken` magic link. | — | Employees fit best as **`User` rows with a new `employee` role**. Internal mobility and referrals already treat every staff user as an employee (`internal-applications` is open to any authenticated staff member). HRMS needs a separate `Employee` record (HR master data) linked 1:1 to `User`, plus a candidate → employee conversion on hire. The **internal-training use case in §1.1** currently has to invite employees as `Candidate` rows. |

---

## 7. SQL Server specifics (for the PostgreSQL move, D10)

| Area | Where | Notes |
|---|---|---|
| Provider | `apps/api/prisma/schema.prisma` (`provider = "sqlserver"`), `migrations/migration_lock.toml` (`mssql`) | Plan is one fresh PostgreSQL baseline migration, as D10 says. |
| Native types in schema | `@db.UniqueIdentifier` ×286, `@db.NVarChar(...)` ×143, `dbgenerated("newid()")` ×12, `@db.Date` ×1 | Map to `@db.Uuid`, `text`/`varchar`, `gen_random_uuid()`. JSON is stored as `NVARCHAR(MAX)` strings (`*Json` columns): consider `jsonb`. |
| **RLS policies** | 50 of 193 migrations touch `SECURITY POLICY`. Function `dbo.fn_tenant_access_predicate` (latest `20260707110004_tenant_rls_function`), `dbo.TenantAccessPolicy` with FILTER and BLOCK predicates on 61 tables. `dbo.fn_record_visibility_predicate` and `fn_pipeline_entries_combined_predicate` (`20260906140001_record_visibility_rls`). | Rewrite as PostgreSQL `CREATE POLICY … USING / WITH CHECK` using `current_setting('app.current_org')`. PostgreSQL allows several policies per table, so the SQL Server "one FILTER predicate per table" workaround goes away. |
| **SESSION_CONTEXT** | `packages/shared/src/prisma/tenant-prisma.service.ts` (keys `app_current_org`, `app_is_super_admin`, `app_current_user`, `app_record_visibility_governed`), `packages/shared/src/soft-delete/soft-delete.extension.ts`, `apps/api/prisma/seed.ts`, `apps/api/scripts/backfill-section-weights.ts`, e2e tests `tenant-isolation`, `auth-flow`, `email-sender-rls`, `soft-delete-for-tenant` | Replace `EXEC sp_set_session_context` with `SELECT set_config('app.current_org', $1, true)` (transaction-local), which also removes the pooled-connection leak and its manual reset. |
| Raw SQL in app code | `apps/api/src/analytics/item-analytics.service.ts` (4 `$queryRaw`), `apps/api/src/approvals/approvals.service.ts` (uses `p.[key]` bracket quoting), `apps/api/src/billing/usage.service.ts` and `apps/exam-runtime/src/billing/quota.service.ts` (`DATEDIFF(MINUTE…)`, `[dbo].[…]`), health checks `SELECT 1` | Review each one: bracket identifiers, `DATEDIFF` and `TOP` must be translated. |
| Append-only audit | `20260802140000_audit_logs_append_only` (`INSTEAD OF DELETE` trigger with `RAISERROR`) | Rewrite as a PostgreSQL trigger or `REVOKE DELETE`. |
| Migration idioms | `GETUTCDATE()` defaults (29 files), `EXEC(N'…')` batching for `CREATE FUNCTION` (5), filtered unique indexes `WHERE … IS NOT NULL` (9, e.g. `offer_token`), `NVARCHAR(MAX)` (50) | Not needed in a fresh baseline, but `now()` must be UTC (`timestamptz`). Filtered unique indexes become partial indexes. |
| Infra | `docker-compose.yml` (mssql/server:2022), `.env.example` (Azure SQL URL), README, deploy runbooks (single VM + pm2) | Switch to a PostgreSQL container. CI runs unit tests only and needs no database. The 36 API e2e suites need a PostgreSQL service. |

---

## 8. Key architecture facts

- **Stack:** npm-workspaces monorepo. Next.js 16 / React 18 (`apps/web`), NestJS 11 (`apps/api`, `apps/exam-runtime`), Prisma 5.10 on SQL Server, BullMQ 5 on Redis, Azure Blob, Sentry, self-hosted Piston for code execution.
- **Tenancy:** shared database, `organization_id` on tenant tables, enforced in two layers: service-layer scoping plus the SQL Server RLS security policy. All tenant queries must go through `TenantPrismaService.forTenant()`, which sets SESSION_CONTEXT inside one transaction and resets it in `finally`. The codebase's own notes call the pooled-connection context leak "the #1 recurring bug". Super-admin bypasses RLS through a session flag, and can switch into an org or impersonate a user (both audited).
- **Auth.** *Staff:* email/password (Argon2id) or per-org SAML. 15-minute JWT access token held in memory, plus a 30-day rotating refresh cookie with family reuse detection. RBAC through `@RequirePermissions` and `PermissionsGuard`, resolved as per-org role override, then permission profile, then seeded defaults. *Candidates:* no accounts. An invitation token is redeemed at `exam-runtime /candidate-auth/redeem` for a candidate JWT (about 4 h, own secrets) scoped to one invitation, with single-active-session enforcement (`activeSessionFamilyId`). Portal, offer, interview, survey and unsubscribe flows use opaque magic-link tokens. Agencies use a portal token.
- **App communication:** web calls `apps/api` (admin, ATS) and `apps/exam-runtime` (candidates) directly. `api` calls `exam-runtime` over an internal-only listener (`127.0.0.1:3003`) with a shared `INTERNAL_SERVICE_SECRET` (`exam-runtime-client`). `exam-runtime` calls back to `api` internal endpoints (`api-internal-client`, e.g. webhook dispatch). Live monitoring is a WebSocket gateway in `exam-runtime` that verifies staff JWTs (the two apps share `JWT_ACCESS_SECRET`), with a local or remote event-bus bridge. BullMQ workers run in-process in `apps/api`.
- **Deployment / CI:** multi-stage `Dockerfile` (api, exam-runtime, web standalone). The current production target is a **single VM with pm2** (`docs/deploy/2026-09-13-full-backlog-and-ai-deploy-runbook.md`). That runbook says prod was last deployed around 1 Aug 2026 and about 90 migrations are pending, which is at odds with D10's "not yet live" (verify with the owner). GitHub Actions `ci.yml` runs install, prisma generate, build shared, unit tests for shared/api/exam-runtime/web, builds, `npm audit --audit-level=high` and a gitleaks secret scan. e2e tests do not run in CI. Dependabot is configured. Seeding is **required** after migrate, because RBAC defaults live in the seed.
- **Tests on origin/main (file counts; case counts approximate from `it(`/`test(`):** packages/shared 37 files (~343 cases); apps/api unit 219 files (~2,719) plus e2e 36 files (~149, needs a real database); apps/exam-runtime 42 files (~722) plus e2e 2 (~5); apps/web 179 files (~1,070 Jest/RTL) plus about 14 Playwright specs in `apps/web/e2e`. Tests were not run for this review.
- **Size:** 93 Prisma models, 193 migrations, 96 web pages, about 80 controllers, about 2,229 commits on `origin/main`. Design docs: about 140 specs and 150 plans in `docs/superpowers/`. Feature gap analysis vs Zoho Recruit: `docs/ats/zoho-adopt-inventory.md`.
- **Stated design principles** (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md` §2, §12, §13):
  - Multi-tenant white-label; built-in AI proctoring; AI-assisted authoring; scale-first (10k+ concurrent).
  - Tenant isolation at both app and database layers ("defence in depth").
  - Split the exam runtime from the admin API by load profile ("modular monolith deployed as separate processes").
  - Server-authoritative timer; slow AI work in background workers, never inline.
  - Buy hard problems (SSO, proctoring ML) rather than build them. In practice SAML was built in-house and proctoring is in-house or AI-assisted.
  - Biometric data is its own compliance category: consent first, store events not video, retention and erasure.
  - Append-only audit; parameterised queries only; CSP and sanitised rich text.
- **Working conventions visible in the code:**
  - Provider-backed features ship switched off and do nothing until an org configures credentials.
  - AI signals only flag for review and never auto-punish.
  - Migrations are hand-written, and applied migrations are never edited.
  - UTC timestamps.
