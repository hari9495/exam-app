'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { AttemptAnswerSummary, AttemptSection } from '../../../lib/types';

export function flattenQuestions(sections: AttemptSection[]) {
  // sectionIndex rides along so the exam page can say "Section 2 of 3" -- a section's own
  // title is whatever the recruiter typed and may mean nothing to a first-time candidate.
  // sectionRequiredCount/sectionQuestionCount ride along too: the exam page has no per-section
  // index of its own (it only steps through this flat list), so the "answer any N of M" badge
  // has to be read off the flattened question rather than off the section directly.
  return sections.flatMap((section, sectionIndex) =>
    section.questions.map((question) => ({
      ...question,
      sectionTitle: section.title,
      sectionIndex,
      sectionRequiredCount: section.requiredCount,
      sectionQuestionCount: section.questions.length,
    })),
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
    return { title: section.title, questions: section.questions, startIndex, requiredCount: section.requiredCount };
  });
  // With a single section the heading would just repeat "Questions" -- only worth the
  // vertical space when there is more than one section to tell apart.
  const showSectionHeadings = groups.length > 1;
  const currentGroupIndex = groups.findIndex(
    (group) => currentIndex >= group.startIndex && currentIndex < group.startIndex + group.questions.length,
  );

  // Collapsible sections (accordion) keep the navigator short enough to fit without its own
  // scrollbar. The section holding the current question is always kept open so the active cell
  // is reachable; the candidate can open any other section to jump across the paper.
  const [openSection, setOpenSection] = useState<number>(currentGroupIndex < 0 ? 0 : currentGroupIndex);
  useEffect(() => {
    if (currentGroupIndex >= 0) setOpenSection(currentGroupIndex);
  }, [currentGroupIndex]);

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
          const isOpen = !showSectionHeadings || openSection === groupIndex;

          return (
            <div key={`${group.title}-${groupIndex}`} className="flex flex-col gap-2">
              {showSectionHeadings ? (
                <button
                  type="button"
                  onClick={() => setOpenSection(isOpen ? -1 : groupIndex)}
                  aria-expanded={isOpen}
                  className="flex items-center justify-between gap-2 text-left"
                >
                  <span
                    className={clsx(
                      'inline-flex min-w-0 items-center gap-1 text-xs font-semibold',
                      isCurrentGroup ? 'text-candidate-primary' : 'text-candidate-text-secondary',
                    )}
                    title={group.title}
                  >
                    <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 transition-transform', !isOpen && '-rotate-90')} aria-hidden="true" />
                    <span className="truncate">{group.title}</span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-candidate-text-tertiary">
                    {answeredInGroup}/{group.requiredCount ?? group.questions.length}
                    {group.requiredCount != null ? ' required' : ''}
                  </span>
                </button>
              ) : null}

              {isOpen ? (
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
              ) : null}
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
