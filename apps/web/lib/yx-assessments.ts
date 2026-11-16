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

/* ------------------------------------------------------------------ AS-2 (PRC-04, PRC-06) */

/** The older exams list (GET /exams), as the builder's "Our tests". */
export interface ExamListPage {
  data: { id: string; title: string; status: string; createdAt: string; invitationCount?: number }[];
}

export function testRows(page: ExamListPage | undefined): import('@yukthix/ui/assessments').TestListRow[] {
  return (page?.data ?? []).map((e) => ({ id: e.id, title: e.title, status: e.status, invited: e.invitationCount ?? 0, createdAt: e.createdAt }));
}

/** GET /reports/:examId/candidates/:candidateId/report, as the score report needs it. */
export interface CandidateDetailResponse {
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  releaseOverride: string | null;
  released: boolean;
  submittedAt: string | null;
  integrityAnalysis: { status: string; level: string | null } | null;
  sections: { title: string; score: number; maxScore: number }[];
}

const INTEGRITY: Record<string, string> = { low: 'Clear', medium: 'Some flags', high: 'Needs review' };

export function scoreReport(d: CandidateDetailResponse): NonNullable<import('@yukthix/ui/assessments').LiveScoreReport['report']> {
  const level = d.integrityAnalysis?.level ?? null;
  return {
    candidateName: d.candidateName,
    status: d.status,
    score: d.score,
    maxScore: d.maxScore,
    percentage: d.percentage,
    passFail: d.passFail,
    releaseOverride: d.releaseOverride,
    released: d.released,
    submittedAt: d.submittedAt,
    integrity: d.integrityAnalysis?.status === 'completed' && level ? (INTEGRITY[level] ?? level) : d.integrityAnalysis ? 'Under review' : 'Not checked',
    sections: d.sections.map((s) => ({ title: s.title, percentage: s.maxScore > 0 ? (s.score / s.maxScore) * 100 : null })),
  };
}
