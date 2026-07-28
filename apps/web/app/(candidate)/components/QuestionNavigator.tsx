'use client';

import clsx from 'clsx';
import { AttemptAnswerSummary, AttemptSection } from '../../../lib/types';

export function flattenQuestions(sections: AttemptSection[]) {
  return sections.flatMap((section) => section.questions.map((question) => ({ ...question, sectionTitle: section.title })));
}

interface QuestionNavigatorProps {
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function QuestionNavigator({ sections, answers, currentIndex, onSelect }: QuestionNavigatorProps) {
  const questions = flattenQuestions(sections);
  const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  return (
    <div className="rounded-lg border border-candidate-border bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-candidate-text-tertiary">Questions</p>
      <div className="grid grid-cols-4 gap-2">
        {questions.map((question, index) => {
          const answer = answersByQuestionId.get(question.id);
          const isCurrent = index === currentIndex;
          const isMarked = answer?.isMarkedForReview;
          const isAnswered = Boolean(answer && answer.selectedOptionIds.length > 0);
          return (
            <button
              key={question.id}
              onClick={() => onSelect(index)}
              aria-label={`Question ${index + 1}`}
              className={clsx(
                'flex aspect-square items-center justify-center rounded-md text-sm font-semibold transition-colors',
                isCurrent && 'border-[1.5px] border-candidate-primary bg-candidate-primary-light text-candidate-primary',
                !isCurrent && isMarked && 'border border-candidate-review-border bg-candidate-review-bg text-candidate-review',
                !isCurrent && !isMarked && isAnswered && 'bg-candidate-primary text-candidate-on-primary',
                !isCurrent && !isMarked && !isAnswered && 'bg-candidate-bg text-candidate-text-faint',
              )}
            >
              {index + 1}
            </button>
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
