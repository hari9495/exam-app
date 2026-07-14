import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionNavigator, flattenQuestions } from './QuestionNavigator';
import { AttemptSection, AttemptAnswerSummary } from '../../../lib/types';

const sections: AttemptSection[] = [
  {
    title: 'Section One',
    targetDurationMinutes: null,
    questions: [
      { id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, options: [{ id: 'o1', text: 'A' }] },
      { id: 'q2', text: 'Q2', type: 'single_mcq', marks: 5, options: [{ id: 'o2', text: 'B' }] },
    ],
  },
];

describe('flattenQuestions', () => {
  it('flattens all sections into one ordered list', () => {
    expect(flattenQuestions(sections).map((q) => q.id)).toEqual(['q1', 'q2']);
  });
});

describe('QuestionNavigator', () => {
  it('marks the current question and calls onSelect when another is clicked', async () => {
    const answers: AttemptAnswerSummary[] = [{ questionId: 'q1', selectedOptionIds: ['o1'], isMarkedForReview: false }];
    const onSelect = jest.fn();
    render(<QuestionNavigator sections={sections} answers={answers} currentIndex={0} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
