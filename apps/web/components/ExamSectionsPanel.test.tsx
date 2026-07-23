import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamSectionsPanel } from './ExamSectionsPanel';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';

jest.mock('./SectionQuestionPicker', () => ({
  SectionQuestionPicker: ({ existingQuestionIds }: { existingQuestionIds: string[] }) => (
    <div data-testid="picker">existingQuestionIds:{JSON.stringify(existingQuestionIds)}</div>
  ),
}));

describe('ExamSectionsPanel', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists existing sections and adds a new one', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/sections') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 's-2', examId: 'exam-1', title: 'Section Two', orderIndex: 1, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null }),
          { status: 201 },
        );
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
                title: 'Section One',
                orderIndex: 0,
                selectionMode: 'fixed',
                poolSize: null,
                poolDifficulty: null,
                targetDurationMinutes: null,
                questions: [{ questionId: 'q1' }],
              },
            ],
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
            <ExamSectionsPanel examId="exam-1" />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Section One')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('New section title'), 'Section Two');
    await userEvent.click(screen.getByRole('button', { name: 'Add section' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/exams/exam-1/sections') && call[1]?.method === 'POST')).toBe(true),
    );
  });

  it('does not submit when the new section title is empty', async () => {
    const fetchMock = jest.fn(async (url) => {
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
            sections: [],
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
            <ExamSectionsPanel examId="exam-1" />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('New section title')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Add section' }));

    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/exams/exam-1/sections') && call[1]?.method === 'POST')).toBe(false);
  });

  it('passes the section\'s existing question ids to the picker instead of an empty array', async () => {
    const fetchMock = jest.fn(async (url) => {
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
                title: 'Section One',
                orderIndex: 0,
                selectionMode: 'fixed',
                poolSize: null,
                poolDifficulty: null,
                targetDurationMinutes: null,
                questions: [{ questionId: 'q1' }],
              },
            ],
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
            <ExamSectionsPanel examId="exam-1" />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Section One')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Manage questions' }));

    expect(await screen.findByTestId('picker')).toHaveTextContent('existingQuestionIds:["q1"]');
  });

  it('locks section/question editing on a published exam that already has invited candidates', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1')) {
        return new Response(
          JSON.stringify({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: null,
            status: 'published',
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            invitationCount: 2,
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
                questions: [{ questionId: 'q1' }],
              },
            ],
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
            <ExamSectionsPanel examId="exam-1" />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Section One')).toBeInTheDocument());
    expect(screen.getByText(/locked because candidates have already been invited/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage questions' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New section title')).not.toBeInTheDocument();
  });
});
