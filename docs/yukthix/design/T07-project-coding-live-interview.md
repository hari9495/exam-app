# T07 · Project-Based Coding & Live Technical Interview

> **Status:** ✅ Decided (6/6), 26 Sep 2026 — Q3, Q4, Q6 are company choices under D17.
> **Covers:** GAP-REGISTER **A10**.
> - Multi-file IDE projects with build and tests.
> - Front-end / framework tasks with live preview.
> - Data-science notebooks and DevOps / shell tasks.
> - Git-based take-home assignments.
> - A **live pair-programming interview** (shared editor + video + interviewer notes + question drawer).
> - **Code playback**: keystroke-level replay.
>
> Competitors: HackerRank (Projects, CodePair), CodeSignal, Codility (CodeLive), HackerEarth (FaceCode).
>
> **Builds on:**
> - T02: coding sandbox limits, SQL, editor policy, run history (Q8 — "multi-file IDE projects not in scope" is now reversed by A10);
> - T01: question versions;
> - T03: delivery / scheduling;
> - T04: proctoring;
> - T05: evaluation / rubrics / integrity;
> - M10: interviews, scorecards, calendar sync;
> - P10: AI tiers;
> - exam app: Piston code execution, code-similarity, AI code review.
>
> **Pricing (D18):** included in the per-attempt price for standard sizes. Heavy compute beyond fair use (long-running workspaces, GPU notebooks) is a usage add-on.
> **Build:** Proctoring track, phase 2.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
Assess senior and practical engineering skills the way engineers actually work:
- real projects with several files, a framework, tests and a build;
- realistic take-home tasks;
- live collaborative interviews.

Every keystroke and run is captured as evidence and replay, so reviewers see *how* the candidate worked, not just the result.

## 2. What exists today (exam app)
- Single-file coding questions on self-hosted Piston: visible and hidden tests, weighted partial scoring, run count telemetry, 5-gram similarity, AI code review.
- M10: interview scheduling, calendar sync (Google / Microsoft with Meet / Teams links), panel scorecards.
- **Missing:**
  - multi-file workspaces, frameworks and live preview;
  - notebooks and git tasks;
  - a collaborative live editor;
  - keystroke replay.

## 3. Concepts
- **Workspace:** an isolated, containerised dev environment per attempt, created from a **project template**. It includes:
  - a repository scaffold (multi-file);
  - a runtime image (Node, Java / Spring, Python / Django, .NET, Go, React / Angular / Vue, SQL DB, Jupyter);
  - a build command and a test suite (visible + hidden);
  - an optional live preview URL;
  - CPU / memory / time limits;
  - **no internet** except an allow-listed package mirror.
- **Task types:**

  | Type | What the candidate does |
  |---|---|
  | **Project** | Implement or fix features in a multi-file repo |
  | **Front-end** | Build a UI with live preview, with tests and optional visual checks |
  | **Data science** | Jupyter notebook with a dataset and evaluation script |
  | **DevOps / shell** | Container / script tasks with verification checks |
  | **Git take-home** | A private repo per candidate with a time box; submission by commit / PR; reviewed as a diff |
  | **Code review** | Review a PR and leave comments, scored against a rubric |

- **Scoring:**
  - automatic: hidden tests, performance checks, lint / quality metrics;
  - rubric-based manual review (T05 rubrics) of code quality and design;
  - AI code review summary as advisory (P10).
- **Live interview room:** a real-time shared editor / workspace with:
  - built-in or linked video (Q4);
  - an interviewer-only panel: question drawer, notes, rubric, hints log;
  - run output and whiteboard;
  - role-based controls: interviewer can reset, add files, take over.
- **Code playback:** a keystroke / edit-level event log per file, with timestamps, runs and paste events, replayable at any speed in reviews and incidents. Paste and large-insert events are flagged (T04 AI-assistance signals).
- **AI-allowed variant:** reuses the T04 "AI-allowed test mode" (C5), with prompts logged.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `project_templates` | Name, stack / runtime image, repo scaffold ref, build / test commands, visible / hidden tests, preview config, limits, version (T01 versioning) |
| `workspaces` | Attempt or interview × template, container ref, region, state (starting / active / paused / submitted / archived), resource usage, expiry |
| `workspace_events` | Append-only edit / keystroke / run / paste / file events (compressed), for playback and signals |
| `workspace_submissions` | Final repo snapshot (tarball / git commit), test results, metrics, AI review summary |
| `takehome_repos` | Candidate × task: repo URL (YukthiX-hosted git), deadline, commits, PR / diff ref |
| `interview_rooms` | M10 interview × room: participants, workspace, video link / session, notes, hints log, recording refs |
| `interview_notes` | Interviewer-private notes, rubric scores (feed M10 scorecard) |

All tables carry `organization_id` + RLS. Workspace events and recordings follow T05 retention (Q5). Candidate code is **Confidential**.

## 5. Rules (YX-CODE)

| ID | Rule |
|---|---|
| YX-CODE-01 | Every workspace is isolated per attempt: no network except the allow-listed package mirror, CPU / memory / time limits per template, destroyed after submission snapshot + retention. |
| YX-CODE-02 | Hidden tests, reference solutions and grading scripts never enter the candidate's workspace; they run in a separate grader container against the submission snapshot. |
| YX-CODE-03 | The submission is an immutable snapshot (files + commit hash). Scores always reference that snapshot and the template version. |
| YX-CODE-04 | Playback events are recorded for every workspace and interview session and are available to reviewers and in incidents (T05). Candidates are told in the consent that their editing is recorded. |
| YX-CODE-05 | Take-home tasks have a deadline shown in the candidate's time zone. Late commits are marked late; the company decides whether late work is accepted (D17). |
| YX-CODE-06 | Automatic scores, AI code review and similarity results are **advisory inputs** to the human rubric (T05). An interviewer's recommendation is required to move an interview candidate forward (M10). |
| YX-CODE-07 | Live interview notes and rubric scores are private to the panel until submitted, and feed the M10 scorecard. Video recording of interviews follows Q4 and requires consent at join. |
| YX-CODE-08 | Similarity checks run across attempts in the tenant (existing 5-gram engine, extended to multi-file) and against public solutions where the partner add-on is enabled (T05 Q3). |
| YX-CODE-09 | Workspace idle / time limits and resource usage are metered; heavy usage beyond fair use follows the D18 usage add-on. |

## 6. Flows
1. **Author a project task:**
   1. Pick a stack template.
   2. Upload the repo scaffold.
   3. Define visible / hidden tests and build.
   4. Set preview and limits.
   5. Dry run with a reference solution.
   6. T01 review.
   7. Publish.
2. **Candidate attempt:**
   1. The workspace starts in seconds from a warm pool.
   2. The candidate codes, runs tests and previews.
   3. Autosave with playback events.
   4. Submit.
   5. Grader runs hidden tests.
   6. Reviewer sees scores, a diff, the playback and AI review.
   7. Rubric score.
3. **Take-home:**
   1. Private repo created.
   2. Invite with deadline.
   3. Candidate clones and commits (web IDE or git over HTTPS with a per-candidate token).
   4. Deadline closes pushes.
   5. Diff review with rubric.
4. **Live interview:**
   1. M10 schedules and sends the room link.
   2. Interviewer opens the question drawer and loads the task.
   3. Candidate joins (consent, identity per test mode).
   4. Pair programming with video.
   5. Interviewer notes and hints logged.
   6. End.
   7. Playback available.
   8. Scorecard submitted.

## 7. UI
- **Web IDE** (Monaco-based):
  - file tree, tabs, terminal, test runner panel, preview pane;
  - editor policy from T02 (autocomplete level).
- **Reviewer view:**
  - side-by-side diff with the scaffold;
  - test results;
  - **playback timeline** (scrubber, speed, jump to flagged events);
  - AI review panel; rubric.
- **Interview room:**
  - shared IDE, video tiles, interviewer drawer (questions, notes, rubric, hints), whiteboard, "end & score".

## 8. Migration & rollout
Proctoring track phase 2:
1. Workspace infrastructure and project templates for the top stacks (Java / Spring, Node, React, Python, SQL).
2. Playback.
3. Live interview room.
4. Take-home git.
5. Notebooks and DevOps tasks.

Existing single-file coding questions keep running on Piston.

## 9. Acceptance tests (samples)
- A candidate `curl` to an external site fails in the workspace; installing an allow-listed npm package works (YX-CODE-01).
- Hidden tests are not present anywhere in the candidate container file system (YX-CODE-02).
- A reviewer replays a 40-minute session at 8× speed and jumps to a flagged 300-line paste (YX-CODE-04).
- A take-home commit 10 minutes after the deadline is marked late (YX-CODE-05).
- An interview can't move the candidate forward without the interviewer's recommendation submitted (YX-CODE-06).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Stacks at first release | **Java / Spring Boot, Node.js / Express, React, Python (Django / FastAPI), SQL (PostgreSQL / MySQL), .NET, Go**, plus **Jupyter (Python) notebooks**; more images added on demand (built once, then available to all). |
| Q2 | Where workspaces run | **YukthiX-hosted containers** in the tenant's data-residency region (P02 Q7) with a warm pool for fast start; per-workspace limits; not on candidates' machines (no local installs). |
| Q3 | Take-home tasks | **YukthiX-hosted private git repos** (web IDE or git over HTTPS with a per-candidate token), time-boxed with late marking; GitHub / GitLab-hosted variant (candidate's or company's account) as an option later. |
| Q4 | Video in the live interview | **Built-in video** (WebRTC) inside the interview room so the whole session (code + video) is in one place and can be recorded with consent; option to use the company's Teams / Meet link instead (already supported by M10 calendar sync). |
| Q5 | Playback & recording retention | Follow **T05 retention** (default 30 days (amended 26 Sep 2026, T05 G17), company sets 30–365; legal hold honoured); playback events stored compressed; recordings in-region. |
| Q6 | AI help inside the IDE | **Off by default** for assessments; a test can enable the T04 **AI-allowed mode** (approved assistant, prompts logged, prompting skill scored); for live interviews the interviewer can enable it for a question. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Stacks at first release:** Java / Spring Boot, Node.js / Express, React, Python (Django / FastAPI), SQL (PostgreSQL / MySQL), .NET, Go + Jupyter (Python) notebooks; more images added on customer request (built once, available to all). | 26 Sep 2026 |
| Q2 | **YukthiX-hosted containers in the tenant's data-residency region** with a warm pool for fast start; no local installs; no internet except the allow-listed package mirror; heavy use beyond fair use (long sessions, GPU notebooks) = usage add-on (YX-CODE-01/09). | 26 Sep 2026 |
| Q3 | **Company decides per task (D17):** all three take-home methods are available — YukthiX-hosted private git repo (web IDE or git over HTTPS with a per-candidate token), the candidate's / company's GitHub or GitLab, or ZIP upload; starter template = YukthiX-hosted repo; deadline, late-work acceptance and allowed methods are company settings (YX-CODE-05). | 26 Sep 2026 |
| Q4 | **Company decides per interview (D17):** built-in video (WebRTC) inside the interview room, recordable with consent, **or** the company's Teams / Meet link via M10 calendar sync; starter template = built-in video (YX-CODE-07). | 26 Sep 2026 |
| Q5 | **Retention follows T05 Q7** (default 30 days (amended 26 Sep 2026, T05 G17), company sets 30–365; legal hold honoured); playback events compressed, recordings in-region — already decided, no new choice. | 26 Sep 2026 |
| Q6 | **Company decides per test / question (D17):** AI help in the IDE off by default; a test may enable the T04 AI-allowed mode (YX-PROC-16: approved assistant, prompts logged, prompting skill scored); interviewers may enable it per question in live interviews. | 26 Sep 2026 |
