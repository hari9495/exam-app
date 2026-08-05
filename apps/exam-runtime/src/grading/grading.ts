import { selectCountedAnswers } from '@exam-platform/shared';

export interface GradableQuestion {
  marks: number;
  negativeMarks: number;
  correctOptionIds: string[];
}

export interface GradedAnswer {
  isCorrect: boolean;
  marksAwarded: number;
}

export function gradeAnswer(question: GradableQuestion, selectedOptionIds: string[]): GradedAnswer {
  const selectedSet = new Set(selectedOptionIds);
  const correctSet = new Set(question.correctOptionIds);
  const isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
  if (isCorrect) {
    return { isCorrect, marksAwarded: question.marks };
  }
  const attempted = selectedOptionIds.length > 0;
  // Use `0 - x` rather than unary `-x`: when negativeMarks is 0, unary negation yields -0,
  // which Jest's toEqual treats as distinct from 0 (Object.is semantics), failing assertions
  // even though -0 === 0 numerically.
  return { isCorrect, marksAwarded: attempted ? 0 - question.negativeMarks : 0 };
}

export interface ResultSummary {
  score: number;
  maxScore: number;
  percentage: number;
  passFail: 'pass' | 'fail';
}

export interface GradableSection {
  sectionId: string;
  weightPercent: number;
  /** null/undefined = every question counts. Otherwise only the best N are scored, out of N. */
  requiredCount?: number | null;
  questionIds: string[];
}

export function computeResult(
  gradedAnswers: { questionId: string; marksAwarded: number }[],
  questions: { id: string; marks: number }[],
  passCriteriaPercent: number,
  sections: GradableSection[],
): ResultSummary {
  const marksAwardedByQuestionId = new Map(gradedAnswers.map((answer) => [answer.questionId, answer.marksAwarded]));
  const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

  // Weighted, not flat: each section's (score/max) ratio contributes its own weightPercent share
  // of the overall percentage. score/maxScore are the COUNTED totals -- for a section with a
  // requiredCount they exclude the dropped answers, so the headline numbers agree with the
  // percentage rather than contradicting it.
  // See docs/superpowers/specs/2026-08-05-answer-any-n-design.md.
  let percentage = 0;
  let score = 0;
  let maxScore = 0;
  for (const section of sections) {
    const counted = selectCountedAnswers(
      section.questionIds.map((questionId) => ({
        questionId,
        marks: marksByQuestionId.get(questionId) ?? 0,
        marksAwarded: marksAwardedByQuestionId.get(questionId) ?? 0,
      })),
      section.requiredCount,
    );
    score += counted.score;
    maxScore += counted.maxScore;
    if (counted.maxScore > 0) {
      percentage += (counted.score / counted.maxScore) * section.weightPercent;
    }
  }

  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
}

export function effectiveDurationMinutes(durationMinutes: number, extraTimePercent: number): number {
  return Math.round(durationMinutes * (1 + extraTimePercent / 100));
}

export function computeRemainingSeconds(
  durationMinutes: number,
  startedAt: Date,
  pausedDurationMs = 0,
  frozenAt: Date | null = null,
): number {
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000 + pausedDurationMs;
  const now = frozenAt ? frozenAt.getTime() : Date.now();
  return Math.max(0, Math.round((deadline - now) / 1000));
}

// Elapsed ACTIVE time -- the complement of computeRemainingSeconds: pausedDurationMs
// (grace already banked from a completed pause-resume cycle) is subtracted here
// rather than added, since it was never actually spent working. frozenAt pins the
// measurement to a specific moment (submittedAt, or pausedAt while paused/blocked);
// omit it for an in-progress attempt to measure up to now.
export function computeElapsedSeconds(startedAt: Date, pausedDurationMs = 0, frozenAt: Date | null = null): number {
  const now = frozenAt ? frozenAt.getTime() : Date.now();
  return Math.max(0, Math.round((now - new Date(startedAt).getTime() - pausedDurationMs) / 1000));
}
