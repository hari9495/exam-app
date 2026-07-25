import { render, screen } from '@testing-library/react';
import { QuestionPreviewCard } from './QuestionPreviewCard';
import { Question } from '../lib/types';

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    type: 'single_mcq',
    text: 'What is 2+2?',
    topic: null,
    category: null,
    difficulty: 'easy',
    marks: 1,
    negativeMarks: 0,
    status: 'active',
    aiGenerated: false,
    languageMode: 'any',
    allowedLanguages: [],
    starterCode: null,
    allowStdin: false,
    snippetCode: null,
    snippetLanguage: null,
    imageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    options: [],
    ...overrides,
  } as Question;
}

describe('QuestionPreviewCard', () => {
  it('renders the answer options with candidate-style lettering and marks the correct one', () => {
    render(
      <QuestionPreviewCard
        question={makeQuestion({
          id: 'q-1',
          text: 'Two numbers are in the ratio 4:5. If their LCM is 140, what is the sum?',
          options: [
            { id: 'o1', text: '45', isCorrect: false, imageUrl: null },
            { id: 'o2', text: '63', isCorrect: true, imageUrl: null },
            { id: 'o3', text: '72', isCorrect: false, imageUrl: null },
          ],
        })}
      />,
    );

    expect(screen.getByText('A. 45')).toBeInTheDocument();
    expect(screen.getByText('B. 63')).toBeInTheDocument();
    expect(screen.getByText('C. 72')).toBeInTheDocument();
    // The whole point of the preview: the recruiter can see which option is right
    // without opening the editor.
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
  });

  it('marks every correct option on a multi-select question, not just the first', () => {
    render(
      <QuestionPreviewCard
        question={makeQuestion({
          id: 'q-1',
          type: 'multi_mcq',
          options: [
            { id: 'o1', text: 'First', isCorrect: true, imageUrl: null },
            { id: 'o2', text: 'Second', isCorrect: false, imageUrl: null },
            { id: 'o3', text: 'Third', isCorrect: true, imageUrl: null },
          ],
        })}
      />,
    );

    expect(screen.getAllByLabelText('Correct answer')).toHaveLength(2);
    expect(screen.getByText('Multi-select')).toBeInTheDocument();
  });

  it('shows difficulty and singular/plural marks in the header', () => {
    const { rerender } = render(<QuestionPreviewCard question={makeQuestion({ id: 'q-1', difficulty: 'hard', marks: 1 })} />);
    expect(screen.getByText('Hard · 1 mark')).toBeInTheDocument();

    rerender(<QuestionPreviewCard question={makeQuestion({ id: 'q-1', difficulty: 'medium', marks: 5 })} />);
    expect(screen.getByText('Medium · 5 marks')).toBeInTheDocument();
  });

  it('shows a code-answer summary with allowed languages instead of options for a code question', () => {
    render(
      <QuestionPreviewCard
        question={makeQuestion({ id: 'q-1', type: 'code', text: 'Two Sum', allowedLanguages: ['python', 'javascript'] })}
      />,
    );

    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Code answer · python, javascript')).toBeInTheDocument();
    expect(screen.queryByText('No answer options added yet.')).not.toBeInTheDocument();
  });

  it('prompts when a non-code question has no options yet', () => {
    render(<QuestionPreviewCard question={makeQuestion({ id: 'q-1', options: [] })} />);

    expect(screen.getByText('No answer options added yet.')).toBeInTheDocument();
  });

  it('does not crash when options and tags are missing from the payload entirely', () => {
    const question = makeQuestion({ id: 'q-1', type: 'code' });
    delete (question as Partial<Question>).options;
    delete (question as Partial<Question>).tags;
    delete (question as Partial<Question>).allowedLanguages;

    render(<QuestionPreviewCard question={question} />);

    expect(screen.getByText('Code answer')).toBeInTheDocument();
  });

  it('renders tag chips and an edit link to the question', () => {
    render(
      <QuestionPreviewCard
        question={makeQuestion({ id: 'q-42', tags: [{ id: 't1', name: 'SQL' }, { id: 't2', name: 'Joins' }] })}
      />,
    );

    expect(screen.getByText('SQL')).toBeInTheDocument();
    expect(screen.getByText('Joins')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/questions/q-42/edit');
  });

  it('flags an AI-generated question', () => {
    render(<QuestionPreviewCard question={makeQuestion({ id: 'q-1', aiGenerated: true })} />);

    expect(screen.getByText('AI')).toBeInTheDocument();
  });
});
