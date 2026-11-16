import type { BankLoad, ItemRow } from '@yukthix/ui/assessments';

// API glue for Assessments AS-1 (the question bank, /question-bank/*, and the older item statistics,
// /analytics/questions/*). The screens in @yukthix/ui/assessments stay presentational; the API checks every call.
// Pages read and write with useApi / useApiWrite (lib/yx-hiring): one cache for Hire and its tests.

/** Where the bank's pages live (inside Hire, so the Hire area lights up; not in the menu until AS-0 merges). */
export const BANK_BASE = '/yx/hiring/assessments';

/** A query's state in the screens' words. */
export function loadState(q: { isLoading: boolean; isError: boolean }): BankLoad {
  return q.isError ? 'error' : q.isLoading ? 'loading' : 'ready';
}

interface Calibration {
  questionId: string;
  text: string;
  responses: number;
  percentCorrect: number;
  declared: string;
  observed: string;
}
interface Flagged {
  questionId: string;
  discrimination: number | null;
  flags: { message: string; code: string }[];
}

const FLAG_WORDS: Record<string, string> = {
  miskeyed_suspect: 'Answer key may be wrong',
  weak_discrimination: 'Weak discrimination',
  too_easy: 'Too easy',
  very_hard: 'Very hard',
  ambiguous_option: 'Misleading option',
  dead_distractor: 'Option never chosen',
};

/** PRC-05 rows: every question with enough answers (calibration), with its discrimination and flags when flagged. */
export function itemRows(calibration: Calibration[], flagged: Flagged[]): ItemRow[] {
  const byId = new Map(flagged.map((f) => [f.questionId, f]));
  return calibration.map((c) => {
    const f = byId.get(c.questionId);
    return { questionId: c.questionId, text: c.text, responses: c.responses, percentCorrect: c.percentCorrect, discrimination: f?.discrimination ?? null, flags: (f?.flags ?? []).map((x) => FLAG_WORDS[x.code] ?? x.message), declared: c.declared, observed: c.observed };
  });
}
