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
  questionIds: string[];
}

export function computeResult(
  gradedAnswers: { questionId: string; marksAwarded: number }[],
  questions: { id: string; marks: number }[],
  passCriteriaPercent: number,
  sections: GradableSection[],
): ResultSummary {
  const rawScore = gradedAnswers.reduce((sum, answer) => sum + answer.marksAwarded, 0);
  const score = Math.max(0, rawScore);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);

  const marksAwardedByQuestionId = new Map(gradedAnswers.map((answer) => [answer.questionId, answer.marksAwarded]));
  const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

  // Weighted, not flat: each section's (score/max) ratio contributes its own weightPercent share
  // of the overall percentage, independent of how many raw marks that section's questions carry.
  // score/maxScore above stay the RAW unweighted totals -- only percentage becomes weighted.
  // See docs/superpowers/specs/2026-08-05-section-weightage-design.md.
  let percentage = 0;
  for (const section of sections) {
    let sectionScore = 0;
    let sectionMax = 0;
    for (const questionId of section.questionIds) {
      sectionScore += marksAwardedByQuestionId.get(questionId) ?? 0;
      sectionMax += marksByQuestionId.get(questionId) ?? 0;
    }
    // Floored per section, so one section's negative marking can never eat into another's
    // earned contribution -- the flat formula's Math.max(0, ...) applied at section granularity.
    sectionScore = Math.max(0, sectionScore);
    if (sectionMax > 0) {
      percentage += (sectionScore / sectionMax) * section.weightPercent;
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
