export interface GradableQuestion {
  marks: number;
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
  return { isCorrect, marksAwarded: isCorrect ? question.marks : 0 };
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
  const score = gradedAnswers.reduce((sum, answer) => sum + answer.marksAwarded, 0);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
}
