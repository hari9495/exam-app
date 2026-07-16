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

export function computeResult(
  gradedAnswers: { marksAwarded: number }[],
  questions: { marks: number }[],
  passCriteriaPercent: number,
): ResultSummary {
  const rawScore = gradedAnswers.reduce((sum, answer) => sum + answer.marksAwarded, 0);
  const score = Math.max(0, rawScore);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
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
