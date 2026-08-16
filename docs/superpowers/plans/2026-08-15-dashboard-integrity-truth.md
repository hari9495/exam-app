# Dashboard Integrity Truth + Question-Bank Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recruiter dashboard's integrity panel read the recalibrated verdicts instead of recomputing the discredited one (85% red → honest 9%), and surface the item-analytics flagged questions as a fourth dashboard panel.

**Architecture:** The dashboard **reads verdicts, never derives them** — `dashboard.service` swaps its counter-derived flag for a `groupBy` over `integrity_analyses.level`. Question health is a new frontend panel over the existing `flagged()` endpoint, which gains one additive `text` field. Two fetches by design: question health is org-wide and slow-moving, so it must not share the filtered analytics payload's cache key.

**Tech Stack:** NestJS 11, Prisma, Next.js 16, React Query, Recharts, Jest.

**Spec:** `docs/superpowers/specs/2026-08-15-dashboard-integrity-truth-design.md`

## Global Constraints

- **Only `highConcern` drives the headline, colour, and thresholds.** `review` is the normal resting state — a "flagged = not clear" reading would show 82% and reproduce the original failure with new numbers.
- Thresholds: `highConcernRate` ≥ 15 red, ≥ 8 amber, else neutral. Production today is 9% → amber.
- `unanalyzed` attempts (no `integrity_analyses` row, or null level) are counted and rendered when non-zero — never silently dropped.
- The question-health panel is **org-wide, ignores the dashboard filter bar, and says so** ("All exams, all time"). React Query `staleTime` 10 minutes, no filter-state in its query key.
- No new endpoint. Backend surface = one additive `text` field on `flagged()`.
- Tests asserting the old counter-derived behaviour are **deleted with a comment, never adapted**.
- No schema change, no migration, no new dependency.

## Key context for every implementer

**Production truth, for verification:** levels are `high_concern 23 / review 195 / clear 47` of 265 submitted attempts (rate 9%); item analytics has 5 negative-discrimination and 50 weak questions of 135 measurable. The finished feature must reproduce these numbers, and they were measured directly in production, so any deviation is a bug in the change, not in the data.

**Why this exists:** `dashboard.service.ts` computes `flaggedAttempts` from `webcamViolationCount + browserActivityViolationCount > 0` — the exact threshold-of-one logic PR #29 removed from the verdict path. The dashboard shows 85% flagged in permanent red while the stored verdicts say 9%.

**Already built, do not rebuild:** `GET /api/v1/analytics/questions/flagged` (item-analytics module) and the frontend hook `useFlaggedQuestions()` at `apps/web/lib/hooks/useQuestions.ts:74`. The spec's line about "a new hook" is stale — the hook exists; only its consumer is new.

## File Structure

**Modify:**
- `apps/api/src/dashboard/dashboard.service.ts` — integrity from `integrityAnalysis.groupBy`; delete the counter filter, the attempts `findMany`, and `eventsBySeverity`.
- `apps/api/src/dashboard/dashboard.service.spec.ts` — delete old-behaviour assertions, add level-based ones.
- `apps/api/src/analytics/item-analytics.service.ts` — `text` on `flagged()` rows.
- `apps/api/src/analytics/item-analytics.service.spec.ts` — cover `text`.
- `apps/web/lib/types.ts` — new `integrity` shape; `text` on the flagged-question type.
- `apps/web/components/dashboard/AnalyticsPanels.tsx` — rework `IntegrityPanel`, add `QuestionHealthPanel`.
- `apps/web/components/dashboard/AnalyticsPanels.test.tsx` (or the existing test file for this component) — updated + new panel tests.

---

### Task 1: Dashboard integrity reads stored verdicts

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**
- Produces (consumed by Task 3's frontend types — keep names exact):

```ts
integrity: {
  submittedAttempts: number;
  highConcern: number;
  review: number;
  clear: number;
  unanalyzed: number;
  highConcernRate: number;  // % of ANALYZED attempts, rounded; 0 when none analyzed
  byType: { type: string; count: number }[];
}
```

- [ ] **Step 1: Write the failing tests**

In `dashboard.service.spec.ts`, find the `getAnalytics` test whose mock `tx` feeds two attempts (assertions at ~line 495: `flaggedAttempts` 1, `flaggedRate` 50). Delete those assertions and the `attempt.findMany` violation-counter mock rows they depend on, leaving this comment at the deletion site:

```ts
// Deliberately removed: these asserted the counter-derived integrity flag
// (violations > 0 => flagged) -- the logic PR #29 removed from the verdict
// path, which survived here and showed recruiters 85% flagged while the
// stored verdicts said 9%. The dashboard now reads integrity_analyses.level.
```

Add to the mock `tx` an `integrityAnalysis.groupBy` mock and new assertions:

```ts
tx.integrityAnalysis = {
  groupBy: jest.fn().mockResolvedValue([
    { level: 'high_concern', _count: { _all: 1 } },
    { level: 'review', _count: { _all: 1 } },
  ]),
};
// ...
expect(result.integrity).toMatchObject({
  submittedAttempts: 2,
  highConcern: 1,
  review: 1,
  clear: 0,
  unanalyzed: 0,
  highConcernRate: 50,
});
```

And three more cases (separate `it` blocks, reusing the suite's existing mock-builder pattern):

1. **Unanalyzed remainder:** 3 submitted attempts, groupBy returns only `[{level:'clear', _count:{_all:2}}]` → `unanalyzed: 1`, `highConcernRate: 0`.
2. **Null level counts as unanalyzed:** groupBy includes `{ level: null, _count: { _all: 1 } }` → that row lands in `unanalyzed`, not in any level bucket.
3. **Rate over analyzed only:** 4 submitted, groupBy `[{level:'high_concern',_count:{_all:1}}]` → `highConcernRate: 100` (1 of 1 analyzed), `unanalyzed: 3`. This pins the denominator choice — a rate over submitted would read 25.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config apps/api/jest.config.js --testPathPattern dashboard.service`
Expected: FAIL — `integrityAnalysis` is not queried and the shape lacks the new fields.

- [ ] **Step 3: Implement**

In `dashboard.service.ts`:

1. In the `DashboardAnalytics` interface (~line 48), replace the `integrity` member with the shape above (drop `cleanAttempts`, `flaggedAttempts`, `flaggedRate`, `bySeverity`).
2. In the `Promise.all` (~line 479): delete the `tx.attempt.findMany({ where: submittedScope, select: { webcamViolationCount... } })` entry — it existed only for the counter flag — and the `tx.proctoringEvent.groupBy({ by: ['severity'], ... })` entry. Add:

```ts
tx.integrityAnalysis.groupBy({ by: ['level'], where: { attempt: submittedScope }, _count: { _all: true } }),
```

(`Attempt.integrityAnalysis` is a 1:1 optional relation — schema line 520 — so `where: { attempt: submittedScope }` scopes identically to the deleted findMany. `submitted` from the existing `tx.attempt.count` is the total.)

3. Replace the integrity computation (~line 515):

```ts
      // ----- Integrity -----
      // Read the stored verdict, never derive one. The previous computation here
      // (violation counters > 0 => flagged) was the threshold-of-one logic PR #29
      // removed from integrity-rules, and it showed 85% flagged while the
      // recalibrated levels said 9%. integrity_analyses is the single source of
      // truth for what an attempt's evidence means.
      const levelCounts = new Map(levelsGrouped.map((g) => [g.level, g._count._all]));
      const highConcern = levelCounts.get('high_concern') ?? 0;
      const review = levelCounts.get('review') ?? 0;
      const clear = levelCounts.get('clear') ?? 0;
      const analyzed = highConcern + review + clear;
      const integrity = {
        submittedAttempts: submitted,
        highConcern,
        review,
        clear,
        // Includes attempts with no analysis row AND rows with a null level:
        // absence must be visible, not read as clean.
        unanalyzed: submitted - analyzed,
        highConcernRate: analyzed ? Math.round((highConcern / analyzed) * 100) : 0,
        byType: eventsByType.map((g) => ({ type: g.eventType, count: g._count._all })).sort((a, b) => b.count - a.count),
      };
```

4. Update the empty-state return (~line 597) to the new zeroed shape.
5. Rename destructured variables to match (the deleted `submittedAttempts` findMany result and `eventsBySeverity` disappear; the groupBy result arrives as `levelsGrouped`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config apps/api/jest.config.js --testPathPattern dashboard.service`
Expected: PASS. Then `npx tsc --noEmit -p apps/api/tsconfig.json` — the type change must not break other consumers; if it does, those consumers are reading integrity fields and must be updated in this task (report them).

- [ ] **Step 5: Mutation check**

Reintroduce the old logic: replace the `groupBy`-based counts with `highConcern = 0; review = 0; clear = analyzed-as-submitted` — or more simply, hardcode `highConcern` to `submitted`. Either way at least the rate-denominator test and the level-mapping test must go red. Restore, report the observed failures.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.spec.ts
git commit -m "fix(dashboard): integrity panel reads stored verdicts instead of recomputing"
```

---

### Task 2: `text` on flagged questions

**Files:**
- Modify: `apps/api/src/analytics/item-analytics.service.ts`
- Test: `apps/api/src/analytics/item-analytics.service.spec.ts`

**Interfaces:**
- Produces: `QuestionAnalytics` gains `text: string` **only in `flagged()` results**. `forQuestion()` continues to omit it (the edit page has the question already); make the field optional on the interface: `text?: string`.

- [ ] **Step 1: Write the failing test**

Add to the `flagged()` describe block, following the suite's existing raw-row mock pattern:

```ts
it('carries the question text so a listing can render without a second fetch', async () => {
  // Reuse the suite's existing mock row for a flagged question, adding text.
  // The exact mock shape must match the file's established $queryRaw mock idiom.
  const rows = [flaggedRowFixture({ question_id: 'q1', text: 'Which of these is a monad?' })];
  mockQueryRaw(rows);

  const result = await service.flagged(context);

  expect(result[0].text).toBe('Which of these is a monad?');
});
```

(If the file has no fixture helper, inline the row literal matching its existing mocks — read the file first; do not invent a new harness.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config apps/api/jest.config.js --testPathPattern item-analytics`
Expected: FAIL — `text` is undefined.

- [ ] **Step 3: Implement**

In `flagged()`'s SQL: add to the inner SELECT `CAST(q.text AS NVARCHAR(300)) AS text,` (capped server-side — `questions.text` is NVARCHAR(MAX) and the panel truncates anyway; the cast also keeps the outer aggregate unambiguous), and to the outer SELECT `MAX(e.text) AS text,`. Extend `AggregateRow` with `text: string`. Thread it through:

```ts
return rows
  .map((r) => ({ ...this.assemble(r, []), text: r.text }))
  ...
```

Add `text?: string;` to `QuestionAnalytics`. Do NOT change `forQuestion()`.

- [ ] **Step 4: Run tests + typecheck**

`npx jest --config apps/api/jest.config.js --testPathPattern item-analytics` → PASS, and every pre-existing test in the file untouched and green. `npx tsc --noEmit -p apps/api/tsconfig.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analytics/item-analytics.service.ts apps/api/src/analytics/item-analytics.service.spec.ts
git commit -m "feat(analytics): flagged questions carry their text for aggregate listings"
```

---

### Task 3: IntegrityPanel reworked to the verdict shape

**Files:**
- Modify: `apps/web/lib/types.ts` (the `integrity` member of `DashboardAnalytics`, ~line 788)
- Modify: `apps/web/components/dashboard/AnalyticsPanels.tsx` (`IntegrityPanel`, ~line 109)
- Test: the component's existing test file (locate `AnalyticsPanels`' tests; follow the file's harness)

**Interfaces:**
- Consumes: Task 1's `integrity` shape, verbatim field names.
- Produces: no exports change; `AnalyticsPanels` still renders `<IntegrityPanel integrity={data.integrity} />`.

- [ ] **Step 1: Update the type**

Replace the `integrity` member in `DashboardAnalytics` (types.ts) with Task 1's shape. Run `npx tsc --noEmit -p apps/web/tsconfig.json` — every red site is a consumer of the old fields; they should all be inside `IntegrityPanel`. If any other component reads `flaggedAttempts`/`flaggedRate`/`bySeverity`, report it before proceeding.

- [ ] **Step 2: Write the failing tests**

In the component test file, delete tests pinning the old two-segment donut / flagged-rate copy (with a one-line comment: they asserted the counter-derived metric). Add:

```tsx
it('headlines high_concern only -- review does not drive the colour', () => {
  // THE test this design exists for: 195 review of 265 must NOT read as an alarm.
  renderIntegrity({ submittedAttempts: 265, highConcern: 23, review: 195, clear: 47, unanalyzed: 0, highConcernRate: 9, byType: [] });
  expect(screen.getByText(/9%/)).toBeInTheDocument();
  expect(screen.getByText(/need review/i)).toBeInTheDocument();
  // amber at 9% (>= 8, < 15): assert via the class/token the implementation uses
});

it('renders the unanalyzed row only when non-zero', () => { /* 0 -> absent; 2 -> "2 not analysed" visible */ });

it('shows the three-way breakdown as context', () => { /* clear/review/high_concern counts all visible */ });
```

Exact query/assertion idioms must follow the existing test file's harness — read it first.

- [ ] **Step 3: Implement the panel**

Rework `IntegrityPanel`:

- Donut becomes three segments: `high_concern` → `C.danger`, `review` → the palette's warning/amber token (check `C` in the file; if no amber exists, use the same muted token the panel's secondary text uses — do NOT introduce a new raw hex), `clear` → `C.success`.
- Headline: `{highConcernRate}%` + copy "need review" (replacing "flagged"), coloured by threshold: ≥15 danger, ≥8 amber, else neutral text token.
- Context rows: counts for high concern / review / clear; an "N not analysed" row rendered only when `unanalyzed > 0`.
- `byType` top-5 bar list unchanged.
- Header icon: `ShieldAlert` when `highConcern > 0`, else `ShieldCheck` (was keyed on `flaggedRate`).
- Empty state unchanged (`submittedAttempts === 0`).

- [ ] **Step 4: Run tests**

Component file's suite + `npx tsc --noEmit -p apps/web/tsconfig.json` → green/clean. (Run the single test file, not the whole web suite — the full local web suite is flaky under parallel load; CI is the authority for the full run.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/types.ts apps/web/components/dashboard/AnalyticsPanels.tsx <test file>
git commit -m "fix(dashboard): integrity panel shows verdict levels, high_concern-only headline"
```

---

### Task 4: QuestionHealthPanel

**Files:**
- Modify: `apps/web/lib/types.ts` (add `text?: string` to the flagged-question type used by `useFlaggedQuestions`)
- Modify: `apps/web/lib/hooks/useQuestions.ts` (only if `useFlaggedQuestions` lacks `staleTime`; set `staleTime: 10 * 60_000`)
- Modify: `apps/web/components/dashboard/AnalyticsPanels.tsx` (new `QuestionHealthPanel`, rendered in the panel grid)
- Test: same component test file

**Interfaces:**
- Consumes: `useFlaggedQuestions()` (exists, `useQuestions.ts:74`) returning `QuestionAnalytics[]` with Task 2's `text`.
- Produces: a fourth panel in `AnalyticsPanels`; no new exports.

- [ ] **Step 1: Write the failing tests**

```tsx
it('headlines the negative-discrimination count as "Likely miskeyed"', () => {
  // 2 negative (discrimination < 0), 1 weak -> headline 2, secondary "1 weak"
});
it('orders the list worst-first by discrimination and links each row to the question edit page', () => {
  // assert href includes /questions/<id>/edit; worst (most negative) first
});
it('shows a positive state when nothing is flagged', () => { /* "No question issues detected" */ });
it('distinguishes not-enough-data from success', () => { /* empty + hasEnoughData-false context -> "Not enough responses yet..." */ });
it('labels the panel org-wide', () => { /* "All exams, all time" visible */ });
```

The not-enough-data state: `flagged()` only returns rows meeting MIN_RESPONSES, so an empty result is ambiguous by itself. Distinguish via the response: empty array + the org having questions ⇒ the panel cannot tell "healthy" from "unmeasured" **from this endpoint alone** — resolve it the cheap way: treat empty as the positive state, with subtext "Questions with at least 20 responses are measured". This avoids a second query while keeping the message honest. (This supersedes the spec's three-distinct-states wording — two states plus honest subtext, because the data to distinguish them isn't in the response. Flag this in your report so the controller records the deviation.)

- [ ] **Step 2: Implement**

`QuestionHealthPanel` in `AnalyticsPanels.tsx`, following the file's existing panel idioms (`Card`, `PanelHeader`, `EmptyNote`):

- Fetch via `useFlaggedQuestions()`; loading → the file's standard skeleton; error → its standard error card. Independent of the other panels' query.
- `negative = items.filter(q => (q.discrimination ?? 0) < 0)`, `weak = items.length - negative.length`.
- Headline: `negative.length` "Likely miskeyed" (danger token when > 0, success when 0); secondary muted: `weak` "weak discrimination".
- List: top 5 by ascending discrimination; each row = truncated `text` (CSS truncate, single line), discrimination to 2dp, `n` responses, wrapped in a `next/link` to `/questions/${questionId}/edit`.
- Footer: "All exams, all time · questions with ≥ 20 responses".
- Render it in the panel grid after the existing three.

- [ ] **Step 3: Run tests + typecheck**

Component test file + `npx tsc --noEmit -p apps/web/tsconfig.json`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useQuestions.ts apps/web/components/dashboard/AnalyticsPanels.tsx <test file>
git commit -m "feat(dashboard): question-bank health panel over flagged-question analytics"
```

---

### Task 5: Full verification

**Files:** none — verification only. Deploy is NOT part of this plan.

- [ ] **Step 1: Suites and typechecks**

```bash
npx jest --config apps/api/jest.config.js
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npx jest --config apps/web/jest.config.js -- --maxWorkers=2 components/dashboard
```

api baseline 895 + this plan's additions − deletions; report actual and account for the delta. Web: run the dashboard component tests locally; the FULL web suite is CI's job (locally flaky under load).

- [ ] **Step 2: Confirm the old metric is gone**

```bash
grep -rn "flaggedAttempts\|cleanAttempts\|flaggedRate\|bySeverity" apps/api/src apps/web --include=*.ts --include=*.tsx | grep -v node_modules
```

Expected: no live-code matches (deletion comments in test files are fine). A survivor is the old metric still being read somewhere.

- [ ] **Step 3: Record**

Append suite counts, the grep result, and any deviations to `.superpowers/sdd/progress.md`.

**At deploy time (not now):** the dashboard's integrity panel must show 23 / 195 / 47 with rate 9% amber, and the question panel exactly 5 "Likely miskeyed" — both equal to the pre-measured production truth. api-only deploy plus web build (both apps changed); exam-runtime untouched.
