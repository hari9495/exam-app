import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionListRow } from './QuestionListRow';
import { Question } from '../lib/types';

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    type: 'single_mcq',
    text: 'What is 2+2?',
    topic: null,
    category: null,
    difficulty: 'medium',
    marks: 3,
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

describe('QuestionListRow', () => {
  it('shows the question text, type, difficulty and marks on one collapsed row', () => {
    render(<QuestionListRow question={makeQuestion({ id: 'q-1', text: 'Speed of the boat?' })} />);

    expect(screen.getByText('Speed of the boat?')).toBeInTheDocument();
    expect(screen.getByText('MCQ')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('keeps options hidden until the row is expanded', async () => {
    render(
      <QuestionListRow
        question={makeQuestion({
          id: 'q-1',
          options: [
            { id: 'o1', text: '45', isCorrect: false, imageUrl: null },
            { id: 'o2', text: '63', isCorrect: true, imageUrl: null },
          ],
        })}
      />,
    );

    expect(screen.queryByText('A. 45')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('A. 45')).toBeInTheDocument();
    expect(screen.getByText('B. 63')).toBeInTheDocument();
    expect(screen.getByLabelText('Correct Answer')).toBeInTheDocument();
  });

  it('collapses again when the row is clicked a second time', async () => {
    render(
      <QuestionListRow
        question={makeQuestion({ id: 'q-1', options: [{ id: 'o1', text: '45', isCorrect: true, imageUrl: null }] })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('A. 45')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('A. 45')).not.toBeInTheDocument();
  });

  it('shows tags only once expanded, keeping the collapsed row dense', async () => {
    render(<QuestionListRow question={makeQuestion({ id: 'q-1', tags: [{ id: 't1', name: 'Arithmetic' }] })} />);

    expect(screen.queryByText('Arithmetic')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Arithmetic')).toBeInTheDocument();
  });

  it('shows the code-answer summary for a code question when expanded', async () => {
    render(
      <QuestionListRow question={makeQuestion({ id: 'q-1', type: 'code', text: 'Two Sum', allowedLanguages: ['python'] })} />,
    );

    expect(screen.getByText('Code')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Code answer · python')).toBeInTheDocument();
  });

  it('links to the question editor', () => {
    render(<QuestionListRow question={makeQuestion({ id: 'q-42' })} />);

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/questions/q-42/edit');
  });
});
