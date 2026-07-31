import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';

describe('SectionQuestionPicker', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lets the recruiter select questions and submits their ids via PUT', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1/sections/s-1/questions') && options?.method === 'PUT') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'q-1', type: 'single_mcq', text: 'What is 2+2?', topic: null, category: null, difficulty: 'easy', marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [] },
            ],
            total: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={[]} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /What is 2\+2\?/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) => String(call[0]).includes('/exams/exam-1/sections/s-1/questions') && call[1]?.method === 'PUT',
        ),
      ).toBe(true),
    );
  });

  it('shows an empty-bank message and blocks saving when there are no questions to pick from', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={[]} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText(/no questions yet/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Save questions' }));

    expect(await screen.findByText(/question bank is empty/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes('/exams/exam-1/sections/s-1/questions') && call[1]?.method === 'PUT',
      ),
    ).toBe(false);
  });

  it('keeps in-progress selections when the parent re-renders with a new existingQuestionIds identity', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'q-1', type: 'single_mcq', text: 'What is 2+2?', topic: null, category: null, difficulty: 'easy', marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [] },
            ],
            total: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ui = (ids: string[]) => (
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={ids} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>
    );
    const { rerender } = render(ui([]));

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
    const checkbox = screen.getByRole('checkbox', { name: /What is 2\+2\?/ });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Parent re-render with a fresh (but equal) array identity, as ExamSectionsPanel
    // produces on every background exam refetch -- selection must survive.
    rerender(ui([]));
    expect(screen.getByRole('checkbox', { name: /What is 2\+2\?/ })).toBeChecked();
  });
});
