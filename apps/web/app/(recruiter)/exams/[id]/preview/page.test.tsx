import { render, screen, waitFor } from '@testing-library/react';
import PreviewPage from './page';
import { AuthProvider } from '../../../../../lib/auth-context';
import { QueryProvider } from '../../../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'exam-1' }) }));

describe('Exam preview page', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the exam title and section list read-only', async () => {
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
            sections: [{ id: 's-1', examId: 'exam-1', title: 'Section One', orderIndex: 0, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null }],
          }),
          { status: 200 },
        );
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
  });
});
