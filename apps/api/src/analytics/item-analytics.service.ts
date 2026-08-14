import { Injectable } from '@nestjs/common';
import {
  TenantPrismaService,
  TenantContext,
  ItemAggregate,
  ItemFlag,
  FlagSeverity,
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
interface OptionRow { option_id: string; text: string; is_correct: boolean; selections: number; order_index: number }

// Only used to sort flagged() output by worst flag first: classifyFlags always pushes
// miskeyed_suspect/weak_discrimination before the p-value/distractor flags, so flags[0] is
// already each question's most severe flag.
// Typed on FlagSeverity (not Record<string, ...>) so an unrecognised severity is a compile
// error instead of an `undefined` sort key.
const SEVERITY_ORDER: Record<FlagSeverity, number> = { critical: 0, warning: 1, info: 2 };

@Injectable()
export class ItemAnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async forQuestion(context: TenantContext, questionId: string): Promise<QuestionAnalytics> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      // No manual organization filter: `questions` is RLS-filtered and forTenant has already
      // set the session context on this connection, so the join below is org-scoped for free.
      const rows = await tx.$queryRaw<AggregateRow[]>`
        SELECT e.question_id,
               COUNT(*)                                         AS n,
               AVG(CAST(e.is_correct AS FLOAT))                 AS p,
               AVG(CASE WHEN e.is_correct = 1 THEN e.rest END)  AS m1,
               AVG(CASE WHEN e.is_correct = 0 THEN e.rest END)  AS m0,
               STDEVP(e.rest)                                   AS sd_rest
        FROM (
          SELECT ans.question_id, ans.is_correct,
                 res.score - COALESCE(ans.marks_awarded, 0) AS rest
          FROM answers   ans
          JOIN attempts  att ON att.id = ans.attempt_id
          JOIN results   res ON res.attempt_id = att.id
          JOIN questions q   ON q.id = ans.question_id
          WHERE att.submitted_at IS NOT NULL
            -- Responses from before a key change answered a DIFFERENT question: their
            -- is_correct reflects an answer key that no longer exists. Pooling them measures
            -- two items as one, and is why a miskeyed question stayed flagged after the
            -- recruiter fixed it. NULL means the key never changed, so everything counts.
            AND (q.answer_key_changed_at IS NULL OR att.submitted_at >= q.answer_key_changed_at)
            AND ans.is_correct IS NOT NULL
            AND q.type IN ('single_mcq', 'multi_mcq', 'true_false')
            AND ans.question_id = ${questionId}
        ) e
        GROUP BY e.question_id`;

      const row = rows[0];
      if (!row || Number(row.n) < MIN_RESPONSES) {
        return {
          questionId,
          responses: row ? Number(row.n) : 0,
          percentCorrect: null,
          discrimination: null,
          flags: [],
          options: [],
          hasEnoughData: false,
        };
      }

      const options = await this.optionCounts(tx, questionId);
      return this.assemble(row, options);
    });
  }

  async flagged(context: TenantContext): Promise<QuestionAnalytics[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.$queryRaw<AggregateRow[]>`
        SELECT e.question_id,
               COUNT(*)                                         AS n,
               AVG(CAST(e.is_correct AS FLOAT))                 AS p,
               AVG(CASE WHEN e.is_correct = 1 THEN e.rest END)  AS m1,
               AVG(CASE WHEN e.is_correct = 0 THEN e.rest END)  AS m0,
               STDEVP(e.rest)                                   AS sd_rest
        FROM (
          SELECT ans.question_id, ans.is_correct,
                 res.score - COALESCE(ans.marks_awarded, 0) AS rest
          FROM answers   ans
          JOIN attempts  att ON att.id = ans.attempt_id
          JOIN results   res ON res.attempt_id = att.id
          JOIN questions q   ON q.id = ans.question_id
          WHERE att.submitted_at IS NOT NULL
            -- Responses from before a key change answered a DIFFERENT question: their
            -- is_correct reflects an answer key that no longer exists. Pooling them measures
            -- two items as one, and is why a miskeyed question stayed flagged after the
            -- recruiter fixed it. NULL means the key never changed, so everything counts.
            AND (q.answer_key_changed_at IS NULL OR att.submitted_at >= q.answer_key_changed_at)
            AND ans.is_correct IS NOT NULL
            AND q.type IN ('single_mcq', 'multi_mcq', 'true_false')
        ) e
        GROUP BY e.question_id
        HAVING COUNT(*) >= ${MIN_RESPONSES}`;

      // Option counts are deliberately NOT fetched here: the listing flags on p and
      // discrimination only, which keeps this to one query regardless of bank size. The
      // distractor flags (ambiguous_option, dead_distractor) appear on the detail view
      // (forQuestion), where fetching one question's options is cheap.
      return rows
        .map((r) => this.assemble(r, []))
        .filter((a) => a.flags.length > 0)
        .sort((a, b) => SEVERITY_ORDER[a.flags[0].severity] - SEVERITY_ORDER[b.flags[0].severity]);
    });
  }

  private async optionCounts(
    tx: { $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> },
    questionId: string,
  ): Promise<OptionCount[]> {
    // JSON_VALUE reads the first element of selected_option_ids_json, i.e. the whole
    // selection for single-select types (single_mcq, true_false). multi_mcq is explicitly
    // excluded below (q.type <> 'multi_mcq'): counting only each candidate's first selection
    // would undercount every option except the first pick, leaving options that were never
    // picked first misread as dead_distractor and percentages that don't sum to 100.
    const rows = await tx.$queryRaw<OptionRow[]>`
      SELECT o.id AS option_id, o.text, o.is_correct, o.order_index,
             SUM(CASE WHEN JSON_VALUE(ans.selected_option_ids_json, '$[0]') = CAST(o.id AS NVARCHAR(36)) THEN 1 ELSE 0 END) AS selections
      FROM question_options o
      -- Joining questions here is not for any column it contributes -- it's what makes this
      -- query's tenant scoping explicit rather than an accident of forQuestion() never being
      -- called with a foreign questionId. Do not remove it as "redundant".
      JOIN questions q   ON q.id = o.question_id
      JOIN answers  ans ON ans.question_id = o.question_id
      JOIN attempts att ON att.id = ans.attempt_id
      JOIN results  res ON res.attempt_id = att.id
      WHERE o.question_id = ${questionId}
        AND q.type <> 'multi_mcq'
        AND att.submitted_at IS NOT NULL
        AND (q.answer_key_changed_at IS NULL OR att.submitted_at >= q.answer_key_changed_at)
        AND ans.is_correct IS NOT NULL
      GROUP BY o.id, o.text, o.is_correct, o.order_index
      ORDER BY o.order_index`;
    return rows.map((r) => ({
      optionId: r.option_id,
      text: r.text,
      isCorrect: Boolean(r.is_correct),
      selections: Number(r.selections),
    }));
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
