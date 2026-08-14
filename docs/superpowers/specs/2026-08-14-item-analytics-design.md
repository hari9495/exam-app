# Item Analytics — Design

**Status:** approved, not yet implemented
**Date:** 2026-08-14
**Roadmap position:** item 2. Follows production observability.

## Problem

The question bank has no measure of question quality. A miskeyed question — one whose stored answer key is wrong — silently mis-scores every candidate who sees it, and nothing surfaces it. Neither recruiters nor the platform can distinguish a question that discriminates well from one that everybody guesses.

**The data to fix this already exists.** Measured in production on 2026-08-14:

| Measure | Value |
|---|---|
| Submitted attempts | 265 |
| Answers | 12,864 |
| Questions with ≥1 answer | 294 |
| Mean answers per question | 43.8 (max 94) |
| **Questions with ≥20 answers** | **154** |
| Organizations with data | 3 |

So this is not a feature that ships empty and waits for usage. Roughly half the bank can be analysed on day one.

**By question type:**

| Type | Answers | `is_correct` null |
|---|---|---|
| `single_mcq` | 11,922 | 0 |
| `code` | 941 | 745 (79%) |
| `multi_mcq` | 1 | 0 |

## Constraints and findings

1. **Read-only.** Nothing in this feature modifies a question, attempt, or answer, and nothing touches the candidate exam path. A bug there could lose a candidate's work.
2. **Time-per-question is not computable and is cut.** `Answer.answeredAt` is set to `new Date()` on *every* upsert (`apps/exam-runtime/src/attempts/attempt.service.ts`), so it records the last save, not the first view. No "question displayed at" timestamp exists. `Answer.telemetryJson` exists but is populated only for `code` questions, for integrity analysis. Capturing timing would require instrumenting the answer-save path and would produce no data for the 265 attempts already recorded.
3. **Code questions are excluded.** 79% of code answers have `is_correct` null because grading is manual and subjective. A p-value over the graded 21% would be a biased sample, not a difficulty estimate.
4. **Multi-tenant.** All queries run org-scoped through the existing tenant RLS. Cross-organisation benchmarking is out of scope and would require a consent model.
5. **No new dependency, no new table, no migration, no scheduled job.**

## Decisions

### Purpose: flag and fix bad questions

Analytics exist to produce a **shortlist of questions to review**, not a passive statistics panel. The highest-value output is detecting miskeyed questions, because those are actively causing harm — every candidate who answered one was mis-scored.

### Compute on read

One grouped SQL aggregate per request. No materialised table, no job, no staleness.

Rejected: a materialised `question_statistics` table refreshed nightly (correct eventually, unjustified at 12,864 rows, and staleness means a recruiter who just fixed a question still sees it flagged); and incremental updates on attempt settlement (discrimination is a *cohort* statistic, so one new attempt shifts every question's numbers — you would recompute the set anyway).

Revisit materialisation when a measurement says to, not before.

### Point-biserial correlation, not the 27% split

The classical upper/lower 27% method discards roughly half the responses. At a mean of 44 responses per question that leaves ~12 per group — too noisy. Point-biserial uses every response and is markedly more stable at these sample sizes.

### Correlate against the rest-score, not the total

Each item is correlated against the candidate's total score **excluding that item**. Including it produces spurious self-correlation: every item looks like it discriminates well, partly because it is correlated with itself. At 20–40 items per exam that inflation is not negligible, and it would systematically hide the weak items this feature exists to find.

## Statistics

### Difficulty (p-value)

```
p = correct responses / total responses
```

**Labelled "% correct" in the UI, never "difficulty".** In classical test theory a *high* p means an *easy* item; that inversion misleads everyone who is not a psychometrician.

### Discrimination (corrected point-biserial)

```
r = (M₁ − M₀) / SD_rest × √(p · q)
```

- `M₁` = mean rest-score of candidates who answered correctly
- `M₀` = mean rest-score of candidates who answered incorrectly
- `SD_rest` = population standard deviation of rest-scores across all responders
- `rest-score` = `Result.score − COALESCE(Answer.marksAwarded, 0)`
- `q = 1 − p`

### Distractor analysis

Selection count per option, as a share of responses. Uses `JSON_VALUE(selected_option_ids_json, '$[0]')`, which groups cleanly in SQL for single-select types — 93% of the data.

`multi_mcq` is **excluded from distractor analysis specifically** (it has 1 answer in production, so `OPENJSON` complexity buys nothing). The exclusion is explicit, not silent; it still receives p-value and discrimination.

## Flags

| Flag | Condition | Severity | Rationale |
|---|---|---|---|
| **Miskeyed suspect** | `r < 0` | Critical | Strong candidates doing *worse* than weak ones. Almost always a wrong answer key. Every candidate who saw it was silently mis-scored. |
| Weak discrimination | `0 ≤ r < 0.20` | Warning | Not separating candidates; costing exam time for little signal. |
| Too easy | `p > 0.95` | Info | Nearly everyone correct; carries almost no information. |
| Very hard | `p < 0.20` | Info | Genuinely hard, or ambiguous. Worth a human look. |
| Ambiguous option | a wrong option chosen more often than the correct one | Warning | Misleading distractor, or a second defensible answer. |
| Dead distractor | an option chosen by nobody | Info | Wasted option — a 4-choice item behaving as 3-choice. |

Flagged questions sort **worst-first**: Critical, then Warning, then Info.

## Eligibility

An answer contributes to a question's statistics when **all** hold:

- Question type is `single_mcq`, `multi_mcq`, or `true_false` (auto-graded).
- `Answer.isCorrect` is not null.
- The attempt has `submittedAt` set.
- The attempt has a `Result` (required for the rest-score).
- The question belongs to the requesting organization (enforced by RLS).

Statistics pool **across exams** — item statistics are a property of the item, not of one exam.

**Minimum 20 responses.** Below the threshold, the UI shows `Not enough responses yet (7 of 20)` and **no statistics at all**. A p-value from 5 candidates renders identically to one from 90; acting on it means retiring a good question, which is the precise failure this feature exists to prevent. Showing the count also tells a recruiter when the question *will* become measurable.

**Known limitation, to be surfaced in the UI rather than hidden:** staff test attempts are indistinguishable from candidate attempts — the schema has no marker. They are included. Against 265 total attempts, a handful of staff runs is a non-trivial share.

## Architecture

Three components, split so that everything worth testing has no dependencies.

### 1. `packages/shared/src/analytics/item-statistics.ts` — pure

No database, no Prisma, no I/O.

```
interface ItemStatsInput { n: number; p: number; m1: number | null; m0: number | null; sdRest: number }
interface ItemFlag { code: string; severity: 'critical' | 'warning' | 'info' }

pointBiserial(input: ItemStatsInput): number | null
classifyFlags(stats, distractors): ItemFlag[]
```

### 2. `apps/api/src/analytics/item-analytics.service.ts`

One grouped aggregate inside `forTenant`, feeding the pure functions. No I/O beyond the query, per ADO #6810.

The aggregation happens **in SQL, not JavaScript** — every component of point-biserial is a SQL aggregate, so the database returns one row per question (~294) rather than one row per answer (~12,864):

```sql
SELECT e.question_id,
       COUNT(*)                                       AS n,
       AVG(CAST(e.is_correct AS FLOAT))               AS p,
       AVG(CASE WHEN e.is_correct = 1 THEN e.rest END) AS m1,
       AVG(CASE WHEN e.is_correct = 0 THEN e.rest END) AS m0,
       STDEVP(e.rest)                                 AS sd_rest
FROM (
  SELECT ans.question_id,
         ans.is_correct,
         res.score - COALESCE(ans.marks_awarded, 0) AS rest
  FROM answers   ans
  JOIN attempts  att ON att.id = ans.attempt_id
  JOIN results   res ON res.attempt_id = att.id
  JOIN questions q   ON q.id = ans.question_id
  WHERE att.submitted_at IS NOT NULL
    AND ans.is_correct IS NOT NULL
    AND q.type IN ('single_mcq', 'multi_mcq', 'true_false')
) e
GROUP BY e.question_id
HAVING COUNT(*) >= 20
```

Aliases are deliberately distinct (`ans` / `att` / `res` / `e`) rather than reusing `a` for both the inner table and the outer subquery — the shadowing version parses but reads ambiguously, and this query will be copied.

The `HAVING COUNT(*) >= 20` enforces the minimum-response threshold in the database, so sub-threshold questions never reach the pure functions at all. Response counts for the "7 of 20" message come from a separate, cheaper count that has no `HAVING`.

### 3. `apps/web`

- A statistics panel on the question detail view (includes distractor breakdown).
- A **"Needs review"** filter on the Question Bank listing flagged questions worst-first.

## Error handling

The failure mode here is not crashes — it is **plausible wrong numbers**. Three cases are handled explicitly:

| Case | Behaviour | Why |
|---|---|---|
| `p = 0` or `p = 1` | discrimination returns `null` | Point-biserial is *undefined*, not zero. Returning 0 would file it under "weak discrimination" when the truth is "unmeasurable" — and it is already flagged as too easy or very hard. |
| `SD_rest = 0` | discrimination returns `null` | Division by zero. Every responder scored identically on the rest of the exam. |
| `n < 20` | no computation | Per the thin-data decision. |

A null discrimination displays as `—`, never as `0`. An attempt without a `Result` is excluded. A question with no answers reads "never used".

## Testing

Producing a number is easy; producing a *correct* number is the job. Four layers:

1. **Hand-computed fixtures** — small datasets with p and r worked out by hand, asserted to tolerance.
2. **A published worked example** — point-biserial appears in standard psychometrics texts with stated answers. Testing against one validates against an outside authority. If the implementation and its test are wrong in the same way, only an external reference catches it.
3. **Property tests** — a randomly-answered item scores r ≈ 0; an item that perfectly tracks total score scores near 1; a perfectly *inverted* item goes clearly negative. That last one is the miskeyed detector, so it must fail if the sign convention flips.
4. **A mutation check on the rest-score correction** — remove the "exclude this item" subtraction and confirm a test fails.

Layer 4 guards the single most likely silent bug. Without the correction every item looks better than it is, the numbers stay entirely plausible, and the weak items quietly vanish from the flagged list — a failure that no crash and no type error would ever reveal.

Degenerate cases get their own tests, and the distinction between them matters:

- **`n = 1` and `n = 19`** — assert that *nothing* is computed and the response carries the count for the "of 20" message. These test the threshold, not the formula.
- **All-correct and all-wrong at `n ≥ 20`** — the formula IS reached, and discrimination must come back `null` rather than `0`. These are the cases most likely to be got wrong, because the arithmetic yields a finite-looking answer.
- **`SD_rest = 0` at `n ≥ 20`** — division by zero, returns `null`.
- **A question whose answers all belong to unsubmitted attempts** — eligibility excludes them, so it reads "never used" despite having answer rows.

## Out of scope

- Time-per-question (see finding 2 — requires instrumenting the candidate exam path)
- Cross-organisation benchmarking and percentiles (requires a consent model)
- Adaptive testing (requires calibrated items, which this feature is a prerequisite for)
- Question versioning — editing a question today silently mixes pre- and post-edit responses in one statistic
- Any write path: auto-retiring, auto-correcting, or modifying flagged questions

## Known gaps, accepted for now

**Editing a question does not reset its statistics.** Fix a miskeyed answer key and the old wrong-key responses stay pooled with the new ones, so the item keeps looking broken until new responses dilute the old. Question versioning is the real fix and is out of scope. Worth revisiting once recruiters actually start acting on flags.

**Staff test attempts are counted.** No schema marker distinguishes them.

**`code` questions get no analytics at all**, so the most expensive questions to write remain unmeasured.
