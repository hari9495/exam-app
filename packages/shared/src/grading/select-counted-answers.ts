export interface CountableQuestion {
  questionId: string;
  marks: number;
  /** 0 for an unanswered question -- callers resolve a missing Answer row to 0 before calling. */
  marksAwarded: number;
}

export interface CountedSelection {
  countedQuestionIds: string[];
  score: number;
  maxScore: number;
}

// Picks which of a section's answers actually count toward its score.
//
// `requiredCount` null/undefined means "all of them" -- the pre-feature behaviour, and what a
// legacy attempt snapshot (written before this shipped) resolves to.
//
// `questions` MUST arrive in the section's own questionIds order: that order is the tie-breaker,
// so that two candidates with identical marks always get the same questions counted, and a
// re-run of grading reproduces the same result. Sorting by marksAwarded alone would leave ties
// resolved by whatever order the array happened to arrive in.
//
// The denominator is the top `requiredCount` MARKS across every question -- including ones the
// candidate never opened -- not `requiredCount * mark`. Publish validation normally guarantees
// equal marks, but a pool section's eligible bank can change after publish, so this has to stay
// well-defined for a mixed-marks draw rather than throwing while settling a live attempt.
export function selectCountedAnswers(
  questions: CountableQuestion[],
  requiredCount: number | null | undefined,
): CountedSelection {
  const limit = requiredCount == null ? questions.length : Math.min(requiredCount, questions.length);

  const counted = questions
    .map((question, index) => ({ question, index }))
    .sort((a, b) => b.question.marksAwarded - a.question.marksAwarded || a.index - b.index)
    .slice(0, limit);

  const score = counted.reduce((sum, entry) => sum + entry.question.marksAwarded, 0);

  const maxScore = questions
    .map((question) => question.marks)
    .sort((a, b) => b - a)
    .slice(0, limit)
    .reduce((sum, marks) => sum + marks, 0);

  return {
    // Restored to the section's own order so downstream display is stable and readable.
    countedQuestionIds: counted.sort((a, b) => a.index - b.index).map((entry) => entry.question.questionId),
    score: Math.max(0, score),
    maxScore,
  };
}
