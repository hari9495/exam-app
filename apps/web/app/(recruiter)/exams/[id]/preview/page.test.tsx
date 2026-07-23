import { render, screen, waitFor } from '@testing-library/react';
import PreviewPage from './page';
import { AuthProvider } from '../../../../../lib/auth-context';
import { QueryProvider } from '../../../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'exam-1' }) }));

const QUESTION = {
  id: 'q-1',
  type: 'single_mcq',
  text: 'What is 2 + 2?',
  topic: null,
  category: null,
  difficulty: 'easy',
  marks: 5,
  negativeMarks: 0,
  status: 'active',
  aiGenerated: false,
  languageMode: 'fixed',
  allowedLanguages: [],
  starterCode: null,
  allowStdin: false,
  snippetCode: null,
  snippetLanguage: null,
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  options: [
    { id: 'o-1', text: '3', isCorrect: false, imageUrl: null },
    { id: 'o-2', text: '4', isCorrect: true, imageUrl: null },
  ],
};

describe('Exam preview page', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the exam title, instructions, and each fixed-section question with its options read-only', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1')) {
        return new Response(
          JSON.stringify({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: 'Answer all questions.',
            status: 'draft',
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            sections: [
              {
                id: 's-1',
                examId: 'exam-1',
                title: 'Section One',
                orderIndex: 0,
                selectionMode: 'fixed',
                poolSize: null,
                poolDifficulty: null,
                targetDurationMinutes: null,
                questions: [{ questionId: 'q-1' }],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/questions')) {
        return new Response(JSON.stringify({ data: [QUESTION], total: 1, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <PreviewPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /3|4/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to exam/i })).toHaveAttribute('href', '/exams/exam-1/edit');
  });

  it('summarizes a pool-mode section instead of listing every pool question', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1')) {
        return new Response(
          JSON.stringify({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: null,
            status: 'draft',
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            sections: [
              {
                id: 's-1',
                examId: 'exam-1',
                title: 'Aptitude Pool',
                orderIndex: 0,
                selectionMode: 'pool',
                poolSize: 3,
                poolDifficulty: 'medium',
                targetDurationMinutes: null,
                questions: [{ questionId: 'q-1' }, { questionId: 'q-2' }, { questionId: 'q-3' }, { questionId: 'q-4' }, { questionId: 'q-5' }],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/questions')) {
        return new Response(JSON.stringify({ data: [QUESTION], total: 1, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <PreviewPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Aptitude Pool')).toBeInTheDocument());
    expect(screen.getByText('Randomly selects 3 of 5 questions per candidate (difficulty: medium).')).toBeInTheDocument();
    expect(screen.queryByText('What is 2 + 2?')).not.toBeInTheDocument();
  });
});
