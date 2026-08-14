# Item Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a shortlist of question-bank items that are statistically broken — above all, miskeyed ones — from data the platform already has.

**Architecture:** Read-only, three layers. A dependency-free statistics module in `packages/shared` holds every formula and threshold. One grouped SQL aggregate in `apps/api`, run inside `forTenant`, does the arithmetic the database is good at and returns one row per question. Two web surfaces consume it: a panel on the question detail and a "Needs review" filter on the Question Bank.

**Tech Stack:** NestJS 11, Next.js 16, Prisma, Azure SQL, Jest, React Query.

**Spec:** `docs/superpowers/specs/2026-08-14-item-analytics-design.md`

## Global Constraints

- **Read-only.** Nothing modifies a question, attempt, or answer. No migration, no new table, no scheduled job, no write endpoint.
- **Minimum 20 responses.** Below it, no statistics are computed or displayed — only `Not enough responses yet (N of 20)`.
- **Auto-graded types only:** `single_mcq`, `multi_mcq`, `true_false`. `code` is excluded entirely.
- **Rest-score correction is mandatory:** each item correlates against `Result.score − COALESCE(Answer.marksAwarded, 0)`, never against the raw total.
- **Discrimination is `null`, never `0`,** when `p = 0`, `p = 1`, or `SD_rest = 0`.
- **UI labels the p-value "% correct", never "difficulty".** High p means an *easy* item; the inversion misleads.
- All queries run inside `forTenant`. No I/O beyond the query itself (ADO #6810).
- No new runtime dependency.

## Key context for every implementer

**RLS gives org-scoping for free here, and you must not defeat it.** `questions` is row-level-security filtered on `organization_id`. `forTenant` sets `sp_set_session_context` on the connection, so a raw query joining `questions` inside that transaction is automatically scoped to the caller's organization. Do **not** add a manual `organization_id` filter, and do **not** set `app_is_super_admin`. A query that joins `questions` and returns rows from another org means the transaction context is wrong — treat that as a bug, not a filter to add.

**This is the first raw SQL inside `forTenant` in `apps/api`.** Nothing else in the app uses `tx.$queryRaw`. Use `tx.$queryRaw` with Prisma's tagged-template form (not `$queryRawUnsafe`) so parameters are bound rather than interpolated.

## File Structure

**Create:**
- `packages/shared/src/analytics/item-statistics.ts` — every formula and threshold. No Prisma, no I/O, no imports beyond types.
- `packages/shared/src/analytics/item-statistics.spec.ts`
- `apps/api/src/analytics/item-analytics.service.ts` — the aggregate query, mapped through the pure module.
- `apps/api/src/analytics/item-analytics.service.spec.ts`
- `apps/api/src/analytics/item-analytics.controller.ts`
- `apps/api/src/analytics/item-analytics.module.ts`
- `apps/web/components/QuestionStatisticsPanel.tsx`
- `apps/web/components/QuestionStatisticsPanel.test.tsx`

**Modify:**
- `packages/shared/src/index.ts` — export the analytics module.
- `apps/api/src/app.module.ts` — register `ItemAnalyticsModule`.
- `apps/web/lib/hooks/useQuestions.ts` — add the analytics query hooks.
- `apps/web/app/(recruiter)/questions/[id]/page.tsx` — mount the panel.
- `apps/web/app/(recruiter)/questions/page.tsx` — add the "Needs review" filter.

All statistical judgement lives in one file with no dependencies, so its tests need no database, no mocks, and no fixtures beyond plain numbers.

---

### Task 1: Pure statistics module

**Files:**
- Create: `packages/shared/src/analytics/item-statistics.ts`
- Test: `packages/shared/src/analytics/item-statistics.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ItemAggregate { questionId: string; n: number; p: number; m1: number | null; m0: number | null; sdRest: number }`
  - `interface OptionCount { optionId: string; isCorrect: boolean; selections: number }`
  - `type FlagSeverity = 'critical' | 'warning' | 'info'`
  - `interface ItemFlag { code: string; severity: FlagSeverity; message: string }`
  - `const MIN_RESPONSES = 20`
  - `pointBiserial(agg: ItemAggregate): number | null`
  - `classifyFlags(agg: ItemAggregate, discrimination: number | null, options: OptionCount[]): ItemFlag[]`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/analytics/item-statistics.spec.ts
import { pointBiserial, classifyFlags, MIN_RESPONSES, ItemAggregate, OptionCount } from './item-statistics';

function agg(overrides: Partial<ItemAggregate> = {}): ItemAggregate {
  return { questionId: 'q1', n: 40, p: 0.5, m1: 60, m0: 40, sdRest: 10, ...overrides };
}

describe('pointBiserial', () => {
  // Worked by hand: r = (60 - 40) / 10 * sqrt(0.5 * 0.5) = 2 * 0.5 = 1.0
  it('computes the standard formula', () => {
    expect(pointBiserial(agg())).toBeCloseTo(1.0, 5);
  });

  // r = (55 - 45) / 20 * sqrt(0.6 * 0.4) = 0.5 * 0.4898979 = 0.2449490
  it('computes a realistic mid-range value', () => {
    expect(pointBiserial(agg({ p: 0.6, m1: 55, m0: 45, sdRest: 20 }))).toBeCloseTo(0.244949, 5);
  });

  // The miskeyed detector. If the sign convention ever flips, this is what catches it.
  it('goes negative when weaker candidates outperform stronger ones on the item', () => {
    const r = pointBiserial(agg({ m1: 40, m0: 60 }));
    expect(r).not.toBeNull();
    expect(r as number).toBeLessThan(0);
  });

  // Undefined, NOT zero -- zero would file it under "weak discrimination".
  it.each([
    ['everyone correct', { p: 1, m0: null }],
    ['everyone wrong', { p: 0, m1: null }],
    ['no spread in rest-scores', { sdRest: 0 }],
  ])('returns null when discrimination is undefined (%s)', (_label, overrides) => {
    expect(pointBiserial(agg(overrides as Partial<ItemAggregate>))).toBeNull();
  });
});

describe('classifyFlags', () => {
  const goodOptions: OptionCount[] = [
    { optionId: 'a', isCorrect: true, selections: 20 },
    { optionId: 'b', isCorrect: false, selections: 10 },
    { optionId: 'c', isCorrect: false, selections: 10 },
  ];

  it('flags negative discrimination as critical', () => {
    const flags = classifyFlags(agg(), -0.15, goodOptions);
    const flag = flags.find((f) => f.code === 'miskeyed_suspect');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('critical');
  });

  it('flags weak discrimination as a warning', () => {
    expect(classifyFlags(agg(), 0.1, goodOptions).map((f) => f.code)).toContain('weak_discrimination');
  });

  it('does not flag discrimination at or above 0.20', () => {
    const codes = classifyFlags(agg(), 0.2, goodOptions).map((f) => f.code);
    expect(codes).not.toContain('weak_discrimination');
    expect(codes).not.toContain('miskeyed_suspect');
  });

  it('flags a too-easy item', () => {
    expect(classifyFlags(agg({ p: 0.97 }), null, goodOptions).map((f) => f.code)).toContain('too_easy');
  });

  it('flags a very hard item', () => {
    expect(classifyFlags(agg({ p: 0.15 }), 0.3, goodOptions).map((f) => f.code)).toContain('very_hard');
  });

  it('flags a distractor chosen more often than the correct answer', () => {
    const options: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 8 },
      { optionId: 'b', isCorrect: false, selections: 25 },
    ];
    expect(classifyFlags(agg({ p: 0.24 }), 0.3, options).map((f) => f.code)).toContain('ambiguous_option');
  });

  it('flags a distractor nobody chose', () => {
    const options: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 30 },
      { optionId: 'b', isCorrect: false, selections: 10 },
      { optionId: 'c', isCorrect: false, selections: 0 },
    ];
    expect(classifyFlags(agg(), 0.3, options).map((f) => f.code)).toContain('dead_distractor');
  });

  it('never flags a dead distractor against the correct option', () => {
    const options: OptionCount[] = [
      { optionId: 'a', isCorrect: true, selections: 0 },
      { optionId: 'b', isCorrect: false, selections: 40 },
    ];
    expect(classifyFlags(agg({ p: 0 }), null, options).map((f) => f.code)).not.toContain('dead_distractor');
  });

  it('returns no flags for a healthy item', () => {
    expect(classifyFlags(agg({ p: 0.6 }), 0.45, goodOptions)).toEqual([]);
  });
});

describe('MIN_RESPONSES', () => {
  it('is 20', () => {
    expect(MIN_RESPONSES).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern item-statistics`
Expected: FAIL — `Cannot find module './item-statistics'`

- [ ] **Step 3: Implement**

```typescript
// packages/shared/src/analytics/item-statistics.ts

// Below this many scored responses, no statistic is computed or shown. A p-value from five
// candidates renders identically to one from ninety, and acting on it means retiring a
// perfectly good question -- the precise failure this feature exists to prevent.
export const MIN_RESPONSES = 20;

const WEAK_DISCRIMINATION = 0.2;
const TOO_EASY_P = 0.95;
const VERY_HARD_P = 0.2;

export interface ItemAggregate {
  questionId: string;
  n: number;
  /** Proportion answering correctly. HIGH p means an EASY item. */
  p: number;
  /** Mean rest-score of candidates who answered correctly. Null when nobody did. */
  m1: number | null;
  /** Mean rest-score of candidates who answered incorrectly. Null when nobody did. */
  m0: number | null;
  /** Population SD of rest-scores across all responders. */
  sdRest: number;
}

export interface OptionCount {
  optionId: string;
  isCorrect: boolean;
  selections: number;
}

export type FlagSeverity = 'critical' | 'warning' | 'info';

export interface ItemFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

// Corrected point-biserial correlation between answering this item correctly and performing
// well on the REST of the exam.
//
// The rest-score correction happens upstream in the SQL (score minus this item's marks). It
// matters: correlating an item against a total that contains it inflates every item's apparent
// quality, because the item is partly correlated with itself. At 20-40 items that inflation is
// not negligible, and it hides exactly the weak items this exists to find.
export function pointBiserial(agg: ItemAggregate): number | null {
  const { p, m1, m0, sdRest } = agg;
  // Undefined rather than zero. Everyone-correct and everyone-wrong items carry no
  // discrimination information at all; reporting 0 would file them under "weak
  // discrimination", implying we measured something. They are already flagged on p alone.
  if (p <= 0 || p >= 1) return null;
  if (sdRest === 0) return null;
  if (m1 === null || m0 === null) return null;
  return ((m1 - m0) / sdRest) * Math.sqrt(p * (1 - p));
}

export function classifyFlags(
  agg: ItemAggregate,
  discrimination: number | null,
  options: OptionCount[],
): ItemFlag[] {
  const flags: ItemFlag[] = [];

  if (discrimination !== null && discrimination < 0) {
    flags.push({
      code: 'miskeyed_suspect',
      severity: 'critical',
      message: 'Stronger candidates answered this correctly less often than weaker ones, which usually means the answer key is wrong.',
    });
  } else if (discrimination !== null && discrimination < WEAK_DISCRIMINATION) {
    flags.push({
      code: 'weak_discrimination',
      severity: 'warning',
      message: 'This question barely separates stronger candidates from weaker ones.',
    });
  }

  if (agg.p > TOO_EASY_P) {
    flags.push({ code: 'too_easy', severity: 'info', message: 'Almost every candidate answers this correctly, so it carries little information.' });
  }
  if (agg.p < VERY_HARD_P) {
    flags.push({ code: 'very_hard', severity: 'info', message: 'Very few candidates answer this correctly. It may be genuinely hard, or unclear.' });
  }

  const correct = options.find((o) => o.isCorrect);
  const distractors = options.filter((o) => !o.isCorrect);

  if (correct && distractors.some((d) => d.selections > correct.selections)) {
    flags.push({
      code: 'ambiguous_option',
      severity: 'warning',
      message: 'A wrong option was chosen more often than the correct one, suggesting it is misleading or also defensible.',
    });
  }
  // Only distractors can be dead. A correct option nobody picked is already covered by p.
  if (distractors.some((d) => d.selections === 0)) {
    flags.push({ code: 'dead_distractor', severity: 'info', message: 'One option was never chosen, so this question effectively offers fewer choices.' });
  }

  return flags;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config packages/shared/jest.config.js --testPathPattern item-statistics`
Expected: PASS, 14 tests.

- [ ] **Step 5: Mutation-check the sign convention and the null contract**

Two mutations, each must turn a test red. Restore after each.

1. In `pointBiserial`, change `(m1 - m0)` to `(m0 - m1)`. The "goes negative" test must FAIL. This is the miskeyed detector — if it survives a sign flip, it is worthless.
2. Change `if (p <= 0 || p >= 1) return null;` to `return 0;`. The null-contract tests must FAIL.

Report the observed failure output for both. A statistics test that passes against inverted statistics is worse than no test.

- [ ] **Step 6: Export and commit**

Add to `packages/shared/src/index.ts`:

```typescript
export * from './analytics/item-statistics';
```

```bash
git add packages/shared/src/analytics packages/shared/src/index.ts
git commit -m "feat(analytics): pure item-statistics module with point-biserial and flagging"
```

---

### Task 2: Analytics service — the aggregate query

**Files:**
- Create: `apps/api/src/analytics/item-analytics.service.ts`
- Test: `apps/api/src/analytics/item-analytics.service.spec.ts`

**Interfaces:**
- Consumes: `pointBiserial`, `classifyFlags`, `MIN_RESPONSES`, `ItemAggregate`, `OptionCount`, `ItemFlag` from `@exam-platform/shared`.
- Produces:
  - `interface QuestionAnalytics { questionId: string; responses: number; percentCorrect: number | null; discrimination: number | null; flags: ItemFlag[]; options: OptionCount[]; hasEnoughData: boolean }`
  - `class ItemAnalyticsService` with `forQuestion(context: TenantContext, questionId: string): Promise<QuestionAnalytics>` and `flagged(context: TenantContext): Promise<QuestionAnalytics[]>`

**Read this before writing the query.** `questions` is RLS-filtered on `organization_id`, and `forTenant` sets the session context on the connection, so joining `questions` inside the transaction scopes results to the caller's organization automatically. Do not add a manual org filter and do not set `app_is_super_admin`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/analytics/item-analytics.service.spec.ts
import { ItemAnalyticsService } from './item-analytics.service';
import { TenantContext } from '@exam-platform/shared';

const context = { organizationId: 'org-1', isSuperAdmin: false } as TenantContext;

function serviceWith(aggregateRows: unknown[], optionRows: unknown[]) {
  const queryRaw = jest.fn()
    .mockResolvedValueOnce(aggregateRows)
    .mockResolvedValueOnce(optionRows);
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({ $queryRaw: queryRaw })) };
  return { service: new ItemAnalyticsService(tenantPrisma as never), queryRaw };
}

describe('ItemAnalyticsService.forQuestion', () => {
  it('reports insufficient data without computing statistics', async () => {
    const { service } = serviceWith([{ question_id: 'q1', n: 7, p: 0.5, m1: 60, m0: 40, sd_rest: 10 }], []);
    const result = await service.forQuestion(context, 'q1');
    expect(result.hasEnoughData).toBe(false);
    expect(result.responses).toBe(7);
    expect(result.percentCorrect).toBeNull();
    expect(result.discrimination).toBeNull();
    expect(result.flags).toEqual([]);
  });

  it('computes statistics and flags once the threshold is met', async () => {
    const { service } = serviceWith(
      [{ question_id: 'q1', n: 40, p: 0.5, m1: 40, m0: 60, sd_rest: 10 }],
      [
        { option_id: 'a', is_correct: true, selections: 20 },
        { option_id: 'b', is_correct: false, selections: 20 },
      ],
    );
    const result = await service.forQuestion(context, 'q1');
    expect(result.hasEnoughData).toBe(true);
    expect(result.responses).toBe(40);
    expect(result.percentCorrect).toBeCloseTo(0.5, 5);
    expect(result.discrimination as number).toBeLessThan(0);
    expect(result.flags.map((f) => f.code)).toContain('miskeyed_suspect');
  });

  it('reports a question with no responses at all as insufficient', async () => {
    const { service } = serviceWith([], []);
    const result = await service.forQuestion(context, 'q1');
    expect(result.hasEnoughData).toBe(false);
    expect(result.responses).toBe(0);
  });

  it('runs inside forTenant so RLS scopes the query', async () => {
    const { service } = serviceWith([], []);
    const tenantPrisma = (service as unknown as { tenantPrisma: { forTenant: jest.Mock } }).tenantPrisma;
    await service.forQuestion(context, 'q1');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });
});

describe('ItemAnalyticsService.flagged', () => {
  it('returns only flagged questions, most severe first', async () => {
    const { service } = serviceWith(
      [
        { question_id: 'healthy', n: 40, p: 0.6, m1: 62, m0: 40, sd_rest: 10 },
        { question_id: 'weak', n: 40, p: 0.5, m1: 51, m0: 49, sd_rest: 10 },
        { question_id: 'miskeyed', n: 40, p: 0.5, m1: 40, m0: 60, sd_rest: 10 },
      ],
      [],
    );
    const results = await service.flagged(context);
    expect(results.map((r) => r.questionId)).toEqual(['miskeyed', 'weak']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config apps/api/jest.config.js --testPathPattern item-analytics.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/analytics/item-analytics.service.ts
import { Injectable } from '@nestjs/common';
import {
  TenantPrismaService,
  TenantContext,
  ItemAggregate,
  ItemFlag,
  OptionCount,
  MIN_RESPONSES,
  pointBiserial,
  classifyFlags,
} from '@exam-platform/shared';

export interface QuestionAnalytics {
  questionId: string;
  responses: number;
  percentCorrect: number | null;
  discrimination: number | null;
  flags: ItemFlag[];
  options: OptionCount[];
  hasEnoughData: boolean;
}

interface AggregateRow { question_id: string; n: number; p: number; m1: number | null; m0: number | null; sd_rest: number }
interface OptionRow { option_id: string; is_correct: boolean; selections: number }

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

@Injectable()
export class ItemAnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async forQuestion(context: TenantContext, questionId: string): Promise<QuestionAnalytics> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      // No manual organization filter: `questions` is RLS-filtered and forTenant has set the
      // session context on this connection, so the join below is already org-scoped.
      const rows = await tx.$queryRaw<AggregateRow[]>`
        SELECT e.question_id,
               COUNT(*)                                        AS n,
               AVG(CAST(e.is_correct AS FLOAT))                AS p,
               AVG(CASE WHEN e.is_correct = 1 THEN e.rest END) AS m1,
               AVG(CASE WHEN e.is_correct = 0 THEN e.rest END) AS m0,
               STDEVP(e.rest)                                  AS sd_rest
        FROM (
          SELECT ans.question_id, ans.is_correct,
                 res.score - COALESCE(ans.marks_awarded, 0) AS rest
          FROM answers   ans
          JOIN attempts  att ON att.id = ans.attempt_id
          JOIN results   res ON res.attempt_id = att.id
          JOIN questions q   ON q.id = ans.question_id
          WHERE att.submitted_at IS NOT NULL
            AND ans.is_correct IS NOT NULL
            AND q.type IN ('single_mcq', 'multi_mcq', 'true_false')
            AND ans.question_id = ${questionId}
        ) e
        GROUP BY e.question_id`;

      const row = rows[0];
      if (!row || Number(row.n) < MIN_RESPONSES) {
        return { questionId, responses: row ? Number(row.n) : 0, percentCorrect: null, discrimination: null, flags: [], options: [], hasEnoughData: false };
      }

      const options = await this.optionCounts(tx, questionId);
      return this.assemble(row, options);
    });
  }

  async flagged(context: TenantContext): Promise<QuestionAnalytics[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.$queryRaw<AggregateRow[]>`
        SELECT e.question_id,
               COUNT(*)                                        AS n,
               AVG(CAST(e.is_correct AS FLOAT))                AS p,
               AVG(CASE WHEN e.is_correct = 1 THEN e.rest END) AS m1,
               AVG(CASE WHEN e.is_correct = 0 THEN e.rest END) AS m0,
               STDEVP(e.rest)                                  AS sd_rest
        FROM (
          SELECT ans.question_id, ans.is_correct,
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
        HAVING COUNT(*) >= ${MIN_RESPONSES}`;

      // Option counts are deliberately NOT fetched here: the listing flags on p and
      // discrimination only, which keeps this to one query regardless of bank size. The
      // distractor flags appear on the detail view, where one question's options are cheap.
      return rows
        .map((r) => this.assemble(r, []))
        .filter((a) => a.flags.length > 0)
        .sort((a, b) => SEVERITY_ORDER[a.flags[0].severity] - SEVERITY_ORDER[b.flags[0].severity]);
    });
  }

  private async optionCounts(tx: { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> }, questionId: string): Promise<OptionCount[]> {
    // JSON_VALUE reads the first element, which is the whole selection for single-select
    // types -- 93% of the data. multi_mcq is excluded from distractor analysis by design.
    const rows = await tx.$queryRaw<OptionRow[]>`
      SELECT o.id AS option_id, o.is_correct,
             SUM(CASE WHEN JSON_VALUE(ans.selected_option_ids_json, '$[0]') = CAST(o.id AS NVARCHAR(36)) THEN 1 ELSE 0 END) AS selections
      FROM question_options o
      JOIN answers  ans ON ans.question_id = o.question_id
      JOIN attempts att ON att.id = ans.attempt_id
      JOIN results  res ON res.attempt_id = att.id
      WHERE o.question_id = ${questionId}
        AND att.submitted_at IS NOT NULL
        AND ans.is_correct IS NOT NULL
      GROUP BY o.id, o.is_correct`;
    return rows.map((r) => ({ optionId: r.option_id, isCorrect: Boolean(r.is_correct), selections: Number(r.selections) }));
  }

  private assemble(row: AggregateRow, options: OptionCount[]): QuestionAnalytics {
    const agg: ItemAggregate = {
      questionId: row.question_id,
      n: Number(row.n),
      p: Number(row.p),
      m1: row.m1 === null ? null : Number(row.m1),
      m0: row.m0 === null ? null : Number(row.m0),
      sdRest: Number(row.sd_rest),
    };
    const discrimination = pointBiserial(agg);
    return {
      questionId: agg.questionId,
      responses: agg.n,
      percentCorrect: agg.p,
      discrimination,
      flags: classifyFlags(agg, discrimination, options),
      options,
      hasEnoughData: true,
    };
  }
}
```

**Verify the table and column names before running.** Confirm the options table is `question_options` with columns `id`, `question_id`, `is_correct`:

```bash
grep -n "@@map(\"question_options\")" -B 12 apps/api/prisma/schema.prisma
```

If the names differ, use what the schema says and note the correction in your report.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config apps/api/jest.config.js --testPathPattern item-analytics.service`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analytics
git commit -m "feat(analytics): item analytics service with org-scoped aggregate query"
```

---

### Task 3: Controller, module and registration

**Files:**
- Create: `apps/api/src/analytics/item-analytics.controller.ts`, `apps/api/src/analytics/item-analytics.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ItemAnalyticsService` with `forQuestion` and `flagged` from Task 2.
- Produces: `GET /api/v1/analytics/questions/:id` and `GET /api/v1/analytics/questions/flagged`, both returning `QuestionAnalytics`.

- [ ] **Step 1: Write the controller**

Follow the existing guard and permission pattern exactly — see `apps/api/src/questions/questions.controller.ts`. The only question-bank permission in this codebase is `question_bank:manage`; use it.

```typescript
// apps/api/src/analytics/item-analytics.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { ItemAnalyticsService } from './item-analytics.service';

@Controller('analytics/questions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ItemAnalyticsController {
  constructor(private readonly analytics: ItemAnalyticsService) {}

  // Declared BEFORE :id so the literal path is not swallowed by the parameter route.
  @Get('flagged')
  @RequirePermissions('question_bank:manage')
  flagged(@CurrentTenant() tenant: TenantContext) {
    return this.analytics.flagged(tenant);
  }

  @Get(':id')
  @RequirePermissions('question_bank:manage')
  forQuestion(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.analytics.forQuestion(tenant, id);
  }
}
```

- [ ] **Step 2: Write the module**

```typescript
// apps/api/src/analytics/item-analytics.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '@exam-platform/shared';
import { ItemAnalyticsController } from './item-analytics.controller';
import { ItemAnalyticsService } from './item-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [ItemAnalyticsController],
  providers: [ItemAnalyticsService],
})
export class ItemAnalyticsModule {}
```

- [ ] **Step 3: Register it**

Add `ItemAnalyticsModule` to the `imports` array in `apps/api/src/app.module.ts`, alongside the other feature modules. **Append it; do not reorder existing entries** — the `providers` array in that file has an `APP_FILTER` ordering dependency, and reordering imports invites touching it.

- [ ] **Step 4: Verify route ordering and the suite**

Run: `npx jest --config apps/api/jest.config.js`
Expected: PASS, 882+ tests.

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: no output, exit 0.

The `flagged` route must be declared before `:id` or `/flagged` resolves as a question id. Confirm by reading the controller — the order is the guarantee, there is no test for it.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analytics apps/api/src/app.module.ts
git commit -m "feat(analytics): expose item analytics endpoints"
```

---

### Task 4: Web — statistics panel on the question detail

**Files:**
- Create: `apps/web/components/QuestionStatisticsPanel.tsx`, `apps/web/components/QuestionStatisticsPanel.test.tsx`
- Modify: `apps/web/lib/hooks/useQuestions.ts`, `apps/web/app/(recruiter)/questions/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /analytics/questions/:id` from Task 3.
- Produces:
  - `useQuestionAnalytics(questionId: string | null)` in `useQuestions.ts`
  - `interface QuestionAnalytics { questionId: string; responses: number; percentCorrect: number | null; discrimination: number | null; flags: { code: string; severity: 'critical' | 'warning' | 'info'; message: string }[]; options: { optionId: string; isCorrect: boolean; selections: number }[]; hasEnoughData: boolean }`

- [ ] **Step 1: Add the hook**

Append to `apps/web/lib/hooks/useQuestions.ts`, following the existing `useQuestion` pattern in that file:

```typescript
export interface QuestionAnalytics {
  questionId: string;
  responses: number;
  percentCorrect: number | null;
  discrimination: number | null;
  flags: { code: string; severity: 'critical' | 'warning' | 'info'; message: string }[];
  options: { optionId: string; isCorrect: boolean; selections: number }[];
  hasEnoughData: boolean;
}

export function useQuestionAnalytics(questionId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<QuestionAnalytics>({
    queryKey: ['question-analytics', questionId],
    queryFn: () => apiFetch(`/analytics/questions/${questionId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(questionId),
  });
}
```

- [ ] **Step 2: Write the failing component tests**

```typescript
// apps/web/components/QuestionStatisticsPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { QuestionStatisticsPanel } from './QuestionStatisticsPanel';
import type { QuestionAnalytics } from '../lib/hooks/useQuestions';

const base: QuestionAnalytics = {
  questionId: 'q1', responses: 40, percentCorrect: 0.62, discrimination: 0.41,
  flags: [], options: [], hasEnoughData: true,
};

describe('QuestionStatisticsPanel', () => {
  it('tells the recruiter how far off the threshold it is', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, responses: 7, percentCorrect: null, discrimination: null, hasEnoughData: false }} />);
    expect(screen.getByText(/7 of 20/)).toBeInTheDocument();
  });

  it('shows no statistics at all below the threshold', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, responses: 7, percentCorrect: null, discrimination: null, hasEnoughData: false }} />);
    expect(screen.queryByText(/% correct/i)).not.toBeInTheDocument();
  });

  it('labels the p-value as % correct, never as difficulty', () => {
    render(<QuestionStatisticsPanel analytics={base} />);
    expect(screen.getByText(/62%/)).toBeInTheDocument();
    expect(screen.queryByText(/difficulty/i)).not.toBeInTheDocument();
  });

  it('renders an em dash rather than zero when discrimination is undefined', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, percentCorrect: 1, discrimination: null }} />);
    expect(screen.getByTestId('discrimination').textContent).toBe('—');
  });

  it('surfaces a critical flag with its explanation', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, discrimination: -0.2, flags: [{ code: 'miskeyed_suspect', severity: 'critical', message: 'Stronger candidates answered this correctly less often than weaker ones, which usually means the answer key is wrong.' }] }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/answer key is wrong/i);
  });

  it('notes that staff test attempts are included', () => {
    render(<QuestionStatisticsPanel analytics={base} />);
    expect(screen.getByText(/test attempts/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest --config apps/web/jest.config.ts --testPathPattern QuestionStatisticsPanel`
Expected: FAIL — cannot resolve `./QuestionStatisticsPanel`.

- [ ] **Step 4: Implement the panel**

```tsx
// apps/web/components/QuestionStatisticsPanel.tsx
'use client';

import type { QuestionAnalytics } from '../lib/hooks/useQuestions';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-slate-300 bg-slate-50 text-slate-700',
};

export function QuestionStatisticsPanel({ analytics }: { analytics: QuestionAnalytics }) {
  if (!analytics.hasEnoughData) {
    return (
      <section className="rounded-md border border-recruiter-border p-4">
        <h2 className="text-sm font-medium">Question statistics</h2>
        <p className="mt-2 text-sm text-recruiter-text-secondary">
          Not enough responses yet ({analytics.responses} of 20). Statistics appear once this question has been answered 20 times.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-recruiter-border p-4">
      <h2 className="text-sm font-medium">Question statistics</h2>

      {analytics.flags.map((flag) => (
        <div key={flag.code} role={flag.severity === 'critical' ? 'alert' : undefined}
             className={`mt-3 rounded-md border px-3 py-2 text-sm ${SEVERITY_STYLES[flag.severity]}`}>
          {flag.message}
        </div>
      ))}

      <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-recruiter-text-secondary">% correct</dt>
          <dd className="text-lg">{analytics.percentCorrect === null ? '—' : `${Math.round(analytics.percentCorrect * 100)}%`}</dd>
        </div>
        <div>
          <dt className="text-recruiter-text-secondary">Discrimination</dt>
          {/* Em dash, never 0 -- an undefined correlation is not a weak one. */}
          <dd className="text-lg" data-testid="discrimination">{analytics.discrimination === null ? '—' : analytics.discrimination.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-recruiter-text-secondary">Responses</dt>
          <dd className="text-lg">{analytics.responses}</dd>
        </div>
      </dl>

      {analytics.options.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <tbody>
            {analytics.options.map((o) => (
              <tr key={o.optionId}>
                <td className="py-1">{o.isCorrect ? 'Correct answer' : 'Distractor'}</td>
                <td className="py-1 text-right">
                  {o.selections} ({analytics.responses === 0 ? 0 : Math.round((o.selections / analytics.responses) * 100)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-xs text-recruiter-text-secondary">
        Includes every submitted attempt, which may contain internal test attempts.
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Mount it on the edit page**

**There is no question *detail* page.** The route is `apps/web/app/(recruiter)/questions/[id]/edit/page.tsx`. That is the right home for this: it is where a recruiter goes to fix a question, so the statistics sit beside the answer key they may need to correct.

That file already early-returns while loading (`if (!question) return <p…>Loading…</p>`), so the panel renders only once the question exists. Add the import, the hook call, and the panel below `<QuestionForm>`:

```tsx
import { QuestionStatisticsPanel } from '../../../../../components/QuestionStatisticsPanel';
import { useQuestion, useUpdateQuestion, useTags, useQuestionAnalytics } from '../../../../../lib/hooks/useQuestions';
```

```tsx
  const { data: analytics } = useQuestionAnalytics(params.id);
```

Then, immediately after the closing `/>` of `<QuestionForm …>` and before the closing `</div>`:

```tsx
      {analytics && (
        <div className="mt-8">
          <QuestionStatisticsPanel analytics={analytics} />
        </div>
      )}
```

Note the import depth is five levels (`../../../../../`), matching the sibling imports already in that file.

- [ ] **Step 6: Run tests and build**

Run: `npx jest --config apps/web/jest.config.ts --testPathPattern QuestionStatisticsPanel`
Expected: PASS, 6 tests.

Run: `npm run build --workspace=apps/web`
Expected: build succeeds.

Then confirm the production output survived, since pm2 serves the standalone build:

```bash
ls apps/web/.next/standalone/apps/web/server.js
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/QuestionStatisticsPanel.tsx apps/web/components/QuestionStatisticsPanel.test.tsx apps/web/lib/hooks/useQuestions.ts "apps/web/app/(recruiter)/questions/[id]/page.tsx"
git commit -m "feat(analytics): question statistics panel on the question detail"
```

---

### Task 5: Web — "Needs review" filter on the Question Bank

**Files:**
- Modify: `apps/web/lib/hooks/useQuestions.ts`, `apps/web/app/(recruiter)/questions/page.tsx`
- Test: `apps/web/app/(recruiter)/questions/page.test.tsx` (exists — append only)

**Interfaces:**
- Consumes: `GET /analytics/questions/flagged` from Task 3, `QuestionAnalytics` from Task 4.
- Produces: `useFlaggedQuestions()` in `useQuestions.ts`.

- [ ] **Step 1: Add the hook**

```typescript
export function useFlaggedQuestions() {
  const { accessToken } = useAuth();
  return useQuery<QuestionAnalytics[]>({
    queryKey: ['flagged-questions'],
    queryFn: () => apiFetch('/analytics/questions/flagged', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/app/(recruiter)/questions/page.test.tsx`. **That file mocks `global.fetch` per test and restores it in `afterEach` — it does NOT mock the hooks.** Match that style exactly.

```typescript
describe('Needs review filter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockApi(flagged: unknown[]) {
    const question = (id: string, text: string) => ({
      id, type: 'single_mcq', text, topic: null, category: null, difficulty: 'easy',
      marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false,
      createdAt: '2026-01-01T00:00:00.000Z', options: [],
    });
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (u.includes('/analytics/questions/flagged')) return new Response(JSON.stringify(flagged), { status: 200 });
      if (u.includes('/tags')) return new Response(JSON.stringify([]), { status: 200 });
      if (u.includes('/questions')) {
        return new Response(JSON.stringify({
          data: [question('q-bad', 'Miskeyed question'), question('q-weak', 'Weak question'), question('q-ok', 'Healthy question')],
          total: 3, page: 1, pageSize: 20,
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
  }

  const flaggedPair = [
    { questionId: 'q-bad', responses: 40, percentCorrect: 0.5, discrimination: -0.2, options: [], hasEnoughData: true,
      flags: [{ code: 'miskeyed_suspect', severity: 'critical', message: 'Answer key is probably wrong.' }] },
    { questionId: 'q-weak', responses: 40, percentCorrect: 0.5, discrimination: 0.1, options: [], hasEnoughData: true,
      flags: [{ code: 'weak_discrimination', severity: 'warning', message: 'Barely separates candidates.' }] },
  ];

  it('shows a count of flagged questions', async () => {
    mockApi(flaggedPair);
    render(<ToastProvider><QueryProvider><AuthProvider><QuestionsPage /></AuthProvider></QueryProvider></ToastProvider>);
    expect(await screen.findByRole('button', { name: /needs review \(2\)/i })).toBeInTheDocument();
  });

  it('lists only flagged questions when active, most severe first', async () => {
    mockApi(flaggedPair);
    render(<ToastProvider><QueryProvider><AuthProvider><QuestionsPage /></AuthProvider></QueryProvider></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: /needs review/i }));

    await waitFor(() => expect(screen.queryByText('Healthy question')).not.toBeInTheDocument());
    const rendered = screen.getAllByText(/question$/i).map((el) => el.textContent);
    expect(rendered.indexOf('Miskeyed question')).toBeLessThan(rendered.indexOf('Weak question'));
  });

  it('offers no Needs review control when nothing is flagged', async () => {
    mockApi([]);
    render(<ToastProvider><QueryProvider><AuthProvider><QuestionsPage /></AuthProvider></QueryProvider></ToastProvider>);
    await screen.findByText('Healthy question');
    expect(screen.queryByRole('button', { name: /needs review/i })).not.toBeInTheDocument();
  });
});
```

If the file's existing render helper differs from the provider nesting above, use the file's version rather than this one — consistency within the file beats consistency with this plan.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest --config apps/web/jest.config.ts --testPathPattern "questions/page"`
Expected: FAIL — no "Needs review" control exists.

- [ ] **Step 4: Implement**

Add a "Needs review (N)" toggle beside the existing status filters in `apps/web/app/(recruiter)/questions/page.tsx`. When active, intersect the question list with the flagged set, ordered by the API's response (already sorted worst-first). Render the control only when the flagged set is non-empty.

**Reuse the page's existing filter state and row rendering.** That file already carries a `visibleRowIds` invariant used by the bulk-action bar; do not restructure it, and confirm the existing tests in the file still pass unmodified.

- [ ] **Step 5: Run the full web suite**

Run: `npx jest --config apps/web/jest.config.ts`
Expected: PASS, 1274+ tests, including the pre-existing questions-page tests unmodified.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useQuestions.ts "apps/web/app/(recruiter)/questions/page.tsx" "apps/web/app/(recruiter)/questions/page.test.tsx"
git commit -m "feat(analytics): Needs review filter on the question bank"
```

---

### Task 6: Full verification and a real-data sanity check

**Files:** none — verification only.

- [ ] **Step 1: Full suites and typechecks**

```bash
npm run build --workspace=packages/shared
npx jest --config packages/shared/jest.config.js
npx jest --config apps/api/jest.config.js
npx jest --config apps/web/jest.config.ts
npx tsc --noEmit -p apps/api/tsconfig.json
```

Expected: all green. Baselines to beat: shared 186, api 882, web 1274.

- [ ] **Step 2: Validate the SQL against real data**

Unit tests mock the database, so nothing so far proves the query runs on Azure SQL — `STDEVP`, `JSON_VALUE` and the `CAST(o.id AS NVARCHAR(36))` comparison are all untested against the real engine.

Run the aggregate directly against the development database and confirm it returns rows with plausible values: `n` at or above 20, `p` between 0 and 1, `sd_rest` non-negative.

Report the row count and a sample row. If `JSON_VALUE` returns nulls for every row, the option ids are not stored as you expect — say so rather than working around it.

- [ ] **Step 3: Sanity-check one question end to end**

Pick a question with many responses. Confirm that `responses` matches a direct `COUNT(*)` over its eligible answers, and that the option selections sum to no more than `responses`.

A sum *exceeding* responses means the `JSON_VALUE` join is double-counting — that is the most likely defect in this feature and it would otherwise surface as quietly wrong percentages.

- [ ] **Step 4: Record the outcome**

Append a dated entry to `.superpowers/sdd/progress.md` covering what shipped, the real-data row counts from Step 2, and the end-to-end check from Step 3.
