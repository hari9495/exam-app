# Dashboard Integrity Truth + Question-Bank Health — Design

**Status:** approved, not yet implemented
**Date:** 2026-08-15
**Origin:** started as ADO #6828 "real analytics dashboard". Exploration found the dashboard already exists (`AnalyticsPanels`: score distribution, integrity, funnel, exam quality, backed by a full `dashboard` module). What is actually broken is narrower and worse: the dashboard's integrity panel contradicts the recalibrated integrity verdicts, and the item-analytics data has no aggregate surface. The scope was redirected accordingly.

## Problem

### 1. The dashboard never heard about the integrity recalibration

PR #29 recalibrated integrity so `high_concern` means "the answer is suspect": 23 of 265 production attempts (9%), verified twice against production. All 265 historical analyses were backfilled to the same standard.

But `apps/api/src/dashboard/dashboard.service.ts` computes its own verdict from raw counters:

```ts
const flaggedAttempts = submittedAttempts.filter(
  (a) => a.webcamViolationCount + a.browserActivityViolationCount > 0
).length;
```

A threshold of one raw violation — **the exact logic the integrity calibration spec was written to kill**, alive in a second location. Measured in production on 2026-08-15:

| | |
|---|---|
| Dashboard integrity panel | **225 / 265 = 85% "flagged"**, red (danger threshold 20%) |
| Recalibrated `integrity_analyses.level` | `high_concern` 23 (9%), `review` 195, `clear` 47 |

The most visible integrity number in the product is the discredited one. The calibration is half-delivered until this panel reads the stored verdict.

**Root cause worth naming: duplication.** The dashboard *recomputed* what `integrity-rules.ts` had already decided, so a fix to the rules could not reach it. The design constraint that follows: the dashboard must **read verdicts, never derive them**.

### 2. Question-bank health has no aggregate view

Item analytics (PR #27) computes point-biserial discrimination per question and found real problems: **5 questions with negative discrimination** (strong candidates do worse than weak — almost always a miskeyed answer) and 50 weak, of 135 measurable. This surfaces only on a single question's edit page. Nobody browses 135 edit pages; the 5 miskeyed questions were found by an ad-hoc SQL query during that project, not by the product.

## Decisions

### Integrity: read the stored verdict

`dashboard.service.ts` deletes the counter-derived flag entirely and joins `integrity_analyses` on the already-scoped submitted attempts:

```sql
SELECT ia.level, COUNT(*) c
FROM integrity_analyses ia
JOIN attempts a ON a.id = ia.attempt_id
WHERE <existing submittedScope conditions>
GROUP BY ia.level
```

New response shape (replaces `cleanAttempts`/`flaggedAttempts`/`flaggedRate`):

```ts
integrity: {
  submittedAttempts: number;
  highConcern: number;
  review: number;
  clear: number;
  unanalyzed: number;       // submittedAttempts - (clear + review + highConcern)
  highConcernRate: number;  // rounded %, denominator = ANALYZED attempts
  byType: { type: string; count: number }[];  // unchanged
}
```

- **Only `highConcern` drives the headline, the colour, and any threshold.** `review` and `clear` render as context rows. This mirrors the per-attempt decision (high_concern = the answer is suspect) so the dashboard and the candidate report finally agree. A naive "flagged = not clear" would have shown 218/265 = 82% — the same failure with new numbers. `review` is the normal resting state, not an alarm.
- **`unanalyzed` is a first-class count**, not silently dropped. An attempt whose analysis row is missing (settlement raced, analysis failed) must be visible — absence looking like health is the failure mode this codebase keeps re-finding. Today the count is 0; the panel renders the row only when non-zero.
- **Thresholds re-anchored:** `highConcernRate` ≥ 15% red, ≥ 8% amber, else neutral. Production today: 9% → amber, honestly reflecting "23 cases worth a look". The old threshold (20% on the old metric) was permanently red.
- **`byType` keeps the raw event-type breakdown.** It answers "what kinds of events occur", which is context, not verdict. Panel copy changes from "flagged" to "need review", matching the candidate report's language.
- `bySeverity` is dropped from the payload: severity of raw events no longer maps to the headline story and nothing else consumes it.

### Question health: a fourth dashboard panel over the existing endpoint

`QuestionHealthPanel` joins the existing three in `AnalyticsPanels`, fed by a new hook `useFlaggedQuestions()` calling the **existing** `GET /api/v1/analytics/questions/flagged`, RLS-scoped, already returning `questionId`, `responses`, `percentCorrect`, `discrimination`, `flags`, and `hasEnoughData` per question.

**One small backend addition** (checked against the source rather than assumed away): `QuestionAnalytics` carries no question text — the per-question edit page supplies its own. The panel's list rows need it, so `flagged()` gains a `text: string` field, selected from the `questions.text` column its query already joins (`q.text`, truncation handled client-side). Additive to the interface, so the existing edit-page consumer is unaffected. This is the entire backend surface of the feature.

- **Headline:** count of negative-discrimination questions, labelled "Likely miskeyed" (today: 5). The actionable set leads, same principle as the integrity headline.
- **Secondary:** weak-discrimination count (today: 50), muted, not an alarm.
- **List:** top 5 worst by point-biserial — truncated question text, discrimination value, response count — each linking to `/questions/[id]/edit` where the existing per-question statistics panel takes over. No new detail view.
- **Org-wide, always, visibly.** The panel ignores the dashboard filter bar and carries the label "All exams, all time". Discrimination is a property of a question, not of one exam; with `MIN_RESPONSES` = 20, filtering to one exam would drop most questions below threshold and render a near-empty panel that reads as a bug. The label is what makes the inconsistent-with-neighbours behaviour legible.

### Approach chosen: read, don't recompute (two fetches, deliberately)

Considered and rejected:

- **One payload** (extend `getAnalytics` to embed question health): couples the dashboard module to the analytics module and re-runs the heaviest aggregate in the module on every filter change, though its result never varies with filters. On a disk-bottlenecked box, wasted work.
- **Shared integrity summariser in `packages/shared`:** over-engineering for one consumer. The fix is to stop deriving, not to relocate the derivation. Revisit when a second consumer of level summaries exists.

The two-fetch shape is a correctness feature, not a compromise: question health has a genuinely different cache key (org-wide, slow-moving) from the filtered analytics payload. React Query: `staleTime` 10 minutes, no dependence on filter-bar state — filter changes re-render the other panels without refetching this one.

## Error handling

| Case | Behaviour | Why |
|---|---|---|
| Attempt has no `integrity_analyses` row | Counted in `unanalyzed`, rendered when non-zero | Missing data must not masquerade as clean |
| Flagged-questions endpoint fails | That panel shows its standard error card; other panels unaffected (separate query) | Panel independence is the point of the second fetch |
| No flagged questions | Positive "No question issues detected" state, with subtext "Questions with at least 20 responses are measured" | `flagged()` returns only flagged rows, so an empty response cannot distinguish "healthy" from "nothing measured yet" without a second query. Rather than add one, the positive state carries the measurement criterion so it stays honest in both cases. (Revised from an earlier three-state design during planning.) |
| Zero submitted attempts in window | Existing empty-analytics state unchanged, `integrity` zeroes | Matches current behaviour |

## Testing

1. **Backend:** new dashboard-service cases for level-count mapping, the `unanalyzed` arithmetic, rate-over-analyzed-only, and zero-attempt state. **Tests asserting the old counter-derived `flaggedAttempts` are deleted with a comment, never adapted** — they encode the logic being removed.
2. **Mutation check:** reverting the SQL join to the counter filter must turn the new tests red.
3. **Frontend:** the three question-panel empty states are distinct; worst-first ordering; edit-page links; org-wide label present. Integrity panel: new shape, new thresholds, and a named test pinning that **`review` does not drive the headline colour** — the mistake this design exists to prevent.
4. **Production verification after deploy:** dashboard integrity must equal the SQL truth (`23 / 195 / 47` of 265, rate 9%) and the question panel must show exactly the 5 known negative-discrimination questions. Both numbers are pre-measured, so verification is comparison, not judgment.

Baselines: api 895, exam-runtime 710, web per CI (local web jest is flaky under parallel load; CI is the authority).

## Out of scope

- Any change to how integrity analyses are computed (that shipped in PR #29)
- Any change to `item-analytics` backend beyond the additive `text` field on `flagged()` described above
- A dedicated question-bank health page with the full 135-question table — revisit if the top-5 list proves insufficient
- Alerting on integrity or question-health thresholds
- The other dashboard panels (score distribution, funnel, exam quality) — an audit of their definitions was explicitly deferred by user choice

## Known gaps, accepted for now

- **Exam Quality panel still uses score standard deviation**, a blunt proxy that partially overlaps the new panel's story. Conflating "does this exam separate candidates" with "which questions are broken" in one panel was rejected; replacing the std-dev metric was deferred with the broader audit.
- **The question panel shows top 5, not all flagged questions.** With today's data (5 negative, 50 weak) the actionable set fits exactly; if the bank grows, the dedicated page in "out of scope" becomes the answer rather than a longer list.
