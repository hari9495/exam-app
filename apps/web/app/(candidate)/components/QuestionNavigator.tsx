'use client';

import clsx from 'clsx';
import { AttemptAnswerSummary, AttemptSection } from '../../../lib/types';

export function flattenQuestions(sections: AttemptSection[]) {
  // sectionIndex rides along so the exam page can say "Section 2 of 3" -- a section's own
  // title is whatever the recruiter typed and may mean nothing to a first-time candidate.
  return sections.flatMap((section, sectionIndex) =>
    section.questions.map((question) => ({ ...question, sectionTitle: section.title, sectionIndex })),
  );
}

// A question counts as answered differently by type: MCQs need a selected option, code
// questions need non-empty code. Kept in one place because both the grid colours and the
// per-section progress counts read it.
function isAnswered(question: { type: string }, answer: AttemptAnswerSummary | undefined) {
  if (!answer) return false;
  if (question.type === 'code') return Boolean(answer.answerText && answer.answerText.trim() !== '');
  return answer.selectedOptionIds.length > 0;
}

interface QuestionNavigatorProps {
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function QuestionNavigator({ sections, answers, currentIndex, onSelect }: QuestionNavigatorProps) {
  const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  // Questions are always contiguous per section (randomise shuffles *within* a section), so
  // a running offset maps each section's local position back to the flat index onSelect wants.
  let cursor = 0;
  const groups = sections.map((section) => {
    const startIndex = cursor;
    cursor += section.questions.length;
    return { title: section.title, questions: section.questions, startIndex };
  });
  // With a single section the heading would just repeat "Questions" -- only worth the
  // vertical space when there is more than one section to tell apart.
  const showSectionHeadings = groups.length > 1;

  return (
    <div className="rounded-lg border border-candidate-border bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-candidate-text-tertiary">Questions</p>

      <div className="flex flex-col gap-4">
        {groups.map((group, groupIndex) => {
          const answeredInGroup = group.questions.filter((question) =>
            isAnswered(question, answersByQuestionId.get(question.id)),
          ).length;
          const isCurrentGroup =
            currentIndex >= group.startIndex && currentIndex < group.startIndex + group.questions.length;

          return (
            <div key={`${group.title}-${groupIndex}`} className="flex flex-col gap-2">
              {showSectionHeadings ? (
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={clsx(
                      'min-w-0 truncate text-xs font-semibold',
                      isCurrentGroup ? 'text-candidate-primary' : 'text-candidate-text-secondary',
                    )}
                    title={group.title}
                  >
                    {group.title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-candidate-text-tertiary">
                    {answeredInGroup}/{group.questions.length}
                  </span>
                </div>
              ) : null}

              <div className="grid grid-cols-4 gap-2">
                {group.questions.map((question, positionInGroup) => {
                  const index = group.startIndex + positionInGroup;
                  const answer = answersByQuestionId.get(question.id);
                  const isCurrent = index === currentIndex;
                  const isMarked = answer?.isMarkedForReview;
                  const answered = isAnswered(question, answer);
                  return (
                    <button
                      key={question.id}
                      onClick={() => onSelect(index)}
                      aria-label={`Question ${index + 1}${showSectionHeadings ? `, ${group.title}` : ''}`}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={clsx(
                        'flex aspect-square items-center justify-center rounded-md text-sm font-semibold transition-colors',
                        isCurrent && 'border-[1.5px] border-candidate-primary bg-candidate-primary-light text-candidate-primary',
                        !isCurrent && isMarked && 'border border-candidate-review-border bg-candidate-review-bg text-candidate-review',
                        !isCurrent && !isMarked && answered && 'bg-candidate-primary text-candidate-on-primary',
                        !isCurrent && !isMarked && !answered && 'bg-candidate-bg text-candidate-text-faint',
                      )}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-candidate-border pt-3 text-xs text-candidate-text-tertiary">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-candidate-primary" /> Answered
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm border border-candidate-review-border bg-candidate-review-bg" /> Marked for review
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-candidate-bg" /> Not answered
        </span>
      </div>
    </div>
  );
}
