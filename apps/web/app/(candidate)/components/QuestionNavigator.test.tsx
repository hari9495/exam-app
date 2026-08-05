import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionNavigator, flattenQuestions } from './QuestionNavigator';
import { AttemptSection, AttemptAnswerSummary, AttemptQuestion } from '../../../lib/types';

// Builders rather than inline literals: AttemptQuestion/AttemptAnswerSummary carry a dozen
// required fields that none of these tests care about, and spelling them out per fixture is
// what left this file with type errors.
function question(id: string, overrides: Partial<AttemptQuestion> = {}): AttemptQuestion {
  return {
    id,
    text: id.toUpperCase(),
    type: 'single_mcq',
    marks: 1,
    languageMode: 'fixed',
    allowedLanguages: [],
    starterCode: null,
    allowStdin: false,
    snippetCode: null,
    snippetLanguage: null,
    imageUrl: null,
    options: [{ id: `${id}-o1`, text: 'A', imageUrl: null }],
    ...overrides,
  };
}

function answer(questionId: string, overrides: Partial<AttemptAnswerSummary> = {}): AttemptAnswerSummary {
  return { questionId, selectedOptionIds: [], answerText: null, codeLanguage: null, isMarkedForReview: false, ...overrides };
}

const sections: AttemptSection[] = [
  {
    title: 'Section One',
    targetDurationMinutes: null,
    requiredCount: null,
    questions: [question('q1'), question('q2')],
  },
];

describe('flattenQuestions', () => {
  it('flattens all sections into one ordered list', () => {
    expect(flattenQuestions(sections).map((q) => q.id)).toEqual(['q1', 'q2']);
  });
});

const multiSections: AttemptSection[] = [
  {
    title: 'Reasoning',
    targetDurationMinutes: null,
    requiredCount: null,
    questions: [question('r1'), question('r2')],
  },
  {
    title: 'Salesforce',
    targetDurationMinutes: null,
    requiredCount: null,
    questions: [question('s1'), question('s2', { type: 'code', options: [] })],
  },
];

describe('QuestionNavigator', () => {
  it('marks the current question and calls onSelect when another is clicked', async () => {
    const answers: AttemptAnswerSummary[] = [answer('q1', { selectedOptionIds: ['q1-o1'] })];
    const onSelect = jest.fn();
    render(<QuestionNavigator sections={sections} answers={answers} currentIndex={0} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('groups the grid under section headings when there is more than one section', () => {
    render(<QuestionNavigator sections={multiSections} answers={[]} currentIndex={0} onSelect={jest.fn()} />);

    expect(screen.getByText('Reasoning')).toBeInTheDocument();
    expect(screen.getByText('Salesforce')).toBeInTheDocument();
  });

  it('omits section headings for a single-section exam', () => {
    render(<QuestionNavigator sections={sections} answers={[]} currentIndex={0} onSelect={jest.fn()} />);

    expect(screen.queryByText('Section One')).not.toBeInTheDocument();
  });

  // The numbers stay continuous across sections, so a question in the second section must
  // still report its flat index -- otherwise selecting it would jump to the wrong question.
  it('keeps numbering continuous across sections and selects by flat index', async () => {
    const onSelect = jest.fn();
    render(<QuestionNavigator sections={multiSections} answers={[]} currentIndex={0} onSelect={onSelect} />);

    // Salesforce isn't the section holding the current question, so it's collapsed by default --
    // expand it first, then its question cells are reachable.
    await userEvent.click(screen.getByRole('button', { name: /Salesforce/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Question 3, Salesforce' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('shows per-section progress, counting written code as answered', () => {
    const answers: AttemptAnswerSummary[] = [
      answer('r1', { selectedOptionIds: ['r1-o1'] }),
      answer('r2', { selectedOptionIds: ['r2-o1'] }),
      // A code question counts as answered when it has code, not selected options -- the
      // navigator used to only look at selectedOptionIds and showed these as untouched.
      answer('s2', { answerText: 'print(1)' }),
    ];
    render(<QuestionNavigator sections={multiSections} answers={answers} currentIndex={0} onSelect={jest.fn()} />);

    expect(screen.getByText('2/2')).toBeInTheDocument(); // Reasoning: both answered
    expect(screen.getByText('1/2')).toBeInTheDocument(); // Salesforce: the code answer counts
  });
});
