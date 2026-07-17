# Live Leaderboard — Design Spec

## Context & Scope

During a live exam, recruiters currently only see candidate *status* and *progress* (answered count) on the Live Monitoring panel — never how well anyone is actually doing. This feature adds a real-time, F1-race-style leaderboard ranking candidates by correct-answer count as they answer, visible to both recruiters (full identities) and candidates (anonymized, their own attempt included).

This is deliberately scoped to **auto-gradable questions only** (`single_mcq`, `multi_mcq`, `true_false`). Code questions are excluded from the live rank, consistent with how the existing settlement pipeline already treats them — `AttemptSettlementService.finalize()` excludes code questions from `scoredQuestions` until a recruiter manually grades them, because there is no live "is this code correct" signal. The leaderboard doesn't invent one; it reuses the same boundary.

**Explicit trade-off, confirmed with the user:** letting candidates watch a live, updating rank inherently leaks correctness feedback mid-exam — a rank change after answering a question tells the candidate whether that answer was probably right. This is a deliberate choice for this feature, not an oversight.

## Scope Decisions

- **Ranking metric**: raw count of correct auto-gradable answers so far — not marks-weighted score, not accounting for negative marking. Matches the literal ask ("top 30 based on the correct answer").
- **Tie-break**: whoever reached their current correct-count first (earliest timestamp of their most recent correct answer) ranks higher — the "whoever crosses the line first" interpretation, not alphabetical or random.
- **No new persisted grading state.** Correctness is computed on demand via the existing pure `gradeAnswer()` function (already used at final settlement) against live `Answer` rows — nothing is written back to `Answer.isCorrect`/`marksAwarded` early. This keeps the leaderboard purely a read-side aggregation, with zero risk of interfering with the real settlement/grading pipeline.
- **Included population**: any candidate whose attempt has started (an `Attempt` row exists), regardless of status (`in_progress`, `paused`, `blocked`, or already submitted) — consistent with how the existing roster defines "started." Not-yet-started (`invited`) candidates don't appear.
- **Recruiter view**: full real names, top 30, single page, no pagination. New "Leaderboard" tab on the exam edit page, alongside the existing Details / Sections & Questions / Live / Grading tabs.
- **Candidate view**: anonymized. Every other candidate is shown as a stable per-exam label ("Candidate 1", "Candidate 2", ...) assigned by a fixed order (invitation creation order) — the label never changes across polls, so a candidate can watch a specific opponent's *position* move without ever learning who they are. The viewing candidate always sees their own real position highlighted. Shown as a small persistent widget near the exam timer ("You're #12"), expandable to the full anonymized top-30.
- **Delivery**: asymmetric by design.
  - Recruiters: real push, via the existing `MonitoringGateway` WebSocket (`/monitoring` namespace) they're already connected to for roster/proctoring updates — a new `leaderboard:update` event, broadcast whenever any candidate in that exam saves an answer.
  - Candidates: polling (~5s interval) via a new endpoint, matching this app's existing candidate-side polling conventions (e.g. the pause/blocked fast-poll already in `useAttemptQuery`). Avoids building new candidate-side WebSocket authentication from scratch for what is primarily a visual feature, not a latency-critical one.
- **Animation**: adds `framer-motion` as a new dependency. No animation library exists in this codebase today; hand-rolling FLIP-style row-reorder transforms is materially more fragile than using a well-tested library's `layout` animation for exactly this "list re-sorts, rows slide to their new position" case — and the animation *is* the deliverable here, not incidental polish.
- **Out of scope for this pass** (explicitly deferred, can be added later): marks-weighted ranking instead of raw correct-count, including code-question scores once manually graded, a "final" frozen leaderboard shown after settlement, historical/per-question leaderboard breakdowns, and true WebSocket push for candidates (polling is the v1 choice).

## Computation

New `computeExamLeaderboard(examId)` (exam-runtime), colocated with grading — likely `apps/exam-runtime/src/grading/leaderboard.ts`, since it reuses `gradeAnswer()` from `grading.ts` and follows the same "pure computation, called by a thin service method" shape as the rest of that module:

1. Load the exam's questions where `type` is `single_mcq`, `multi_mcq`, or `true_false`, with their options (for `correctOptionIds`).
2. Load every `Attempt` for the exam that has started, with their `Answer` rows.
3. For each attempt: for each auto-gradable question with an answer, run the existing `gradeAnswer()` and count corrects; track the `answeredAt` of the answer that produced the *current* correct-count (i.e., the most recent correct answer) for tie-breaking.
4. Sort by `(correctCount desc, tieBreakTimestamp asc)`, take top 30.
5. Return `{ attemptId, candidateId, correctCount, rank }[]` — no candidate name in this shared core; naming/anonymization is applied at the two call sites (recruiter vs candidate) separately, so the anonymization boundary lives at the edge, not buried in the shared computation.

## Delivery — Recruiter (push)

- `MonitoringService`/`MonitoringGateway` gain a `leaderboard:update` broadcast (`apps/exam-runtime/src/monitoring/monitoring.gateway.ts`), following the exact shape of the existing `emitAttemptStatus`/`emitProctoringFlag` methods.
- Triggered from `AttemptService.answer()` after a successful save, when the answered question is auto-gradable (skip the recompute+broadcast entirely for code-question answers — no ranking-relevant change occurred).
- `join-exam` gets an additional initial payload, `leaderboard:snapshot`, alongside the existing `roster:snapshot`, so the new tab has data immediately without waiting for the next candidate answer.
- Payload includes real candidate names (already permitted for this staff-authenticated socket, same as the roster).

## Delivery — Candidate (poll)

- New candidate-facing endpoint, session-derived per this codebase's existing route convention: `GET /attempt/leaderboard`.
- Returns the same ranking, with every row **except the requesting candidate's own** replaced by its stable anonymized label; the candidate's own row is flagged so the frontend can highlight it.
- Frontend polls this via a new hook (`useLeaderboard`), ~5s interval, only while the attempt is `in_progress` (no point polling once submitted or while paused/blocked, since no new answers can be saved in those states).

## Frontend

- **Recruiter**: `LeaderboardPanel` component + new "Leaderboard" tab (`apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`'s existing tab pattern). Ranked list with `framer-motion`'s `layout` animation on each row so re-sorts visibly slide rows to their new position rather than snapping.
- **Candidate**: small persistent widget on the exam page near the timer, showing the candidate's own rank; expandable to the anonymized top-30 with the same slide animation.

## Testing

- **Backend unit**: `computeExamLeaderboard` — correct-count tallying, code-question exclusion, tie-break ordering, empty-answers (no one has answered yet) case, an attempt with zero correct answers still appearing (ranked last, not omitted).
- **Backend e2e**: extend the existing live-monitoring WebSocket e2e pattern — join as recruiter, candidate answers an auto-gradable question correctly, assert `leaderboard:update` fires with the expected rank; assert a code-question answer does *not* trigger a broadcast.
- **Frontend unit**: `LeaderboardPanel` renders ranks/names and reacts to `leaderboard:update`; candidate widget correctly maps other rows to stable anonymized labels while keeping the viewer's own row identified; polling only active while `in_progress`.
