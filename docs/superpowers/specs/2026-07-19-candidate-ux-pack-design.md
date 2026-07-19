# Candidate UX Pack — Design

## Problem

Market research (2026-07-18, competitor + candidate-sentiment analysis) found that assessment-stage drop-off runs 60-75%, and named four specific, cheap-to-fix candidate-experience gaps this platform has today:

- Candidates go straight from redeeming an invite into a timed, monitored exam with **no chance to learn the interface first** — a common cause of low scores attributed to unfamiliarity rather than ability.
- The welcome screen shows only total duration; candidates can't see **what the exam actually contains** (how many sections, how many questions) before committing to start.
- After submitting, candidates see a static **"submitted" message that never changes** — no feedback, ever, even after the recruiter has fully reviewed and settled the result. "No feedback after rejection" was a top-5 candidate complaint in the research.
- There is no way to grant a candidate **extra time** for disability or language accommodations — every candidate on an exam gets the exact same duration.

This is the second feature in a competitor-research-driven roadmap, following Integrity & Anti-Cheating (shipped 2026-07-19). It targets the candidate side of the funnel rather than the buyer side.

## Scope

Four independent, small sub-features, each touching different layers:

1. **Practice questions** — a fixed, unscored warm-up step before the real exam.
2. **Time transparency** — a section/question-count breakdown on the welcome screen.
3. **Candidate feedback report** — a per-exam configurable level of post-submission feedback.
4. **Accommodations** — per-candidate extra time, expressed as a percentage bonus.

## 1. Practice questions

Two hardcoded questions — one MCQ, one tiny code question — shown as a new step in the candidate welcome flow, before the (already-shipped) consent screen. The code question exercises the same Monaco-editor + run-code UI as the real exam so candidates are comfortable with it before the clock starts. Candidates can answer, mark, and move on, or skip entirely via a "Skip practice" affordance (visible immediately, no forced interaction). Nothing is submitted, scored, or persisted — this is **pure `apps/web` component work with zero backend involvement**: no new schema, no new endpoint, no telemetry capture (this is not a monitored surface).

Location: a new step/component under `apps/web/app/(candidate)/`, wired into the existing welcome flow ahead of the consent step. The two questions are literal constants in the frontend — not stored in the database, not editable by orgs (per the approved "generic fixed practice set" scope decision).

## 2. Time transparency

Exam-runtime's pre-start preview response (the `GET /attempt/current` branch that runs before an `Attempt` row exists) gains a `sections: { title: string, questionCount: number }[]` array. For `fixed`-selection sections this is `questions.length`; for `pool`-selection sections it's `poolSize`. No question text, option text, or answer data is included — only titles and counts, so nothing about exam content leaks pre-consent.

The welcome screen renders this as a compact breakdown beneath the existing "Duration: X minutes" line — e.g. a small list of section titles each with their question count, plus a total question count. This is additive to the welcome screen the consent-screen work (Integrity feature, Task 7) already extended; no conflict, this slots in above the monitoring-disclosure card.

## 3. Candidate feedback report

**Schema**: `Exam.feedbackVisibility String @default("pass_fail")`, one of four values: `none` (today's static "submitted" message, unchanged), `pass_fail` (adds pass/fail), `score` (adds numeric percentage), `breakdown` (adds a per-section score list). Default `pass_fail` on new exams.

**Exam builder**: a new `<select>` on the Details tab (`apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`'s Details panel), positioned alongside the existing pass-criteria%/duration fields, following that tab's established form-field pattern (label, control, inline save via the existing "Save details" button — no separate save action).

**Candidate-facing**: the submitted page becomes dynamic instead of static. A candidate-authenticated read (extending the existing settled-attempt path of `GET /attempt/current`, or a new sibling endpoint if that response shape gets unwieldy — implementer's call, both live in `attempt.service.ts`) returns the candidate's own result, filtered server-side to the exam's `feedbackVisibility` level — the frontend never receives data above what the org allowed, mirroring the "server enforces, not just UI hides" principle already used for the consent gate. Section-level scores for the `breakdown` level are computed directly in `apps/exam-runtime` from data already in scope there: `Attempt.sectionSnapshotJson` (section → question-id mapping, already parsed by the existing `getCurrent` flow) joined against graded `Answer` rows (`isCorrect`/`marksAwarded`, already computed at settlement). No new cross-service call and no duplication of `apps/api`'s recruiter-facing section-score logic is needed — exam-runtime already has everything required in the tables it already queries.

Attempts still in `pending_manual_grade` (has ungraded code questions) must show a distinct "still being reviewed" state regardless of `feedbackVisibility` — there is no final result yet, so nothing can be shown even at `none`'s baseline. This state already exists conceptually (recruiter dashboards show `pending_manual_grade`); the candidate submitted page needs its own copy for it.

## 4. Accommodations

**Schema**: `Invitation.extraTimePercent Int @default(0)`. Zero means no accommodation — the common case, no behavior change.

**Settlement math**: `apps/exam-runtime/src/grading/attempt-settlement.service.ts` is the single place `durationMinutes` feeds into `remainingSeconds`/expiry calculations (`remainingSeconds()`, `isExpired()`, `settleIfExpired()`). The effective duration becomes `exam.durationMinutes * (1 + invitation.extraTimePercent / 100)`, computed once and threaded through every call site that currently reads `exam.durationMinutes` directly for timing purposes. This is the only change point — grading, section snapshots, and everything else that already depends on `SettlementExam` shape stays as-is; `SettlementExam`'s interface gains the fields needed to compute the effective duration (or the caller pre-computes it — implementer's call on the cleanest interface).

**Recruiter UI**: an inline "Extra time" edit control on the candidates list / invitation row (`apps/web/app/(recruiter)/candidates/page.tsx` or the exam's candidate roster, wherever the existing per-invitation actions already live), editable any time before that invitation's `Attempt` exists. Once an attempt exists (candidate has started), the control becomes read-only — changing timing mid-attempt is out of scope and would be actively confusing given the "silent" display decision below.

**Candidate UI**: no new UI. The welcome screen's existing "Duration: X minutes" line reads `exam.durationMinutes` straight off the pre-start preview response today; that field must change to return the candidate's own **effective** duration (`exam.durationMinutes × (1 + invitation.extraTimePercent / 100)`) rather than the raw exam value — the same preview-response code path that item 2's `sections` array is added to (`AttemptService.getCurrent`'s pre-start branch in `apps/exam-runtime`) already has the resolved `invitation` in scope, so this is one more field computed alongside the section summary, not a separate change. Per explicit product decision, the accommodation is **never flagged as an accommodation** — the candidate only ever sees their own number, framed as simply "the" duration, with nothing to compare it against. This avoids the candidate overthinking why their clock differs from what they might expect, while still satisfying "time transparency" (item 2) honestly, since each candidate is only ever shown their own real number.

## Error handling

- Missing/malformed practice-question interaction: impossible by construction — nothing is submitted, there's no server round-trip to fail.
- Section-count computation for pool sections with `poolSize` unset: falls back to `0` (matches how pool sections already degrade elsewhere in the codebase rather than throwing).
- Feedback visibility read on an attempt with no `Result` yet (still `in_progress`): the existing "keep taking the exam" flow is untouched — the feedback-report logic only applies to settled/pending-review states, which are already distinct from `in_progress` in the current `AttemptCurrentResponse` union.
- `extraTimePercent` edits attempted after an attempt exists: rejected server-side (400), not just UI-disabled — mirrors this codebase's standing pattern of never trusting client-side-only enforcement for anything affecting exam integrity or timing.

## Testing

- Practice: component tests for the practice step (renders both questions, skip works, no network calls fire).
- Time transparency: unit tests on the section-summary computation (fixed vs. pool sections, pool section with unset `poolSize`); frontend test asserting the breakdown renders with correct counts.
- Feedback: unit tests per `feedbackVisibility` level (all four) including the `pending_manual_grade` guard; exam builder test for the new select persisting via the existing save flow; e2e covering at least the `breakdown` level end-to-end (highest complexity level, exercises the section-score computation).
- Accommodations: unit tests on the duration multiplier (0%, 50%, and a case landing exactly on a whole-minute boundary); recruiter UI test for the edit control's enabled-before/disabled-after-attempt-start states; server-side rejection test for editing after an attempt exists; e2e proving a candidate with a live +50% invitation actually receives a longer `remainingSeconds` than the exam's stated duration.

## Out of scope

- Org-authored or exam-sourced practice questions (only the fixed generic set, per the approved scope decision).
- Org-wide (rather than per-exam) feedback-visibility default.
- Any feedback level beyond the four named ones (no free-form recruiter commentary, no AI-written candidate feedback).
- Fixed-minutes accommodation (percentage only).
- Editing `extraTimePercent` after an attempt has started.
- Any candidate-visible indication that their duration was adjusted.
- Bulk-setting accommodations across multiple candidates at once (one invitation at a time, matching how the recruiter UI already edits invitations individually).
