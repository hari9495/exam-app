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
    await userEvent.type(screen.getByLabelText('New Section Title'), 'Section Two');
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

    await waitFor(() => expect(screen.getByLabelText('New Section Title')).toBeInTheDocument());
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

  it("shows each section's question titles and marks once questions have been added", async () => {
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
                questions: [
                  { questionId: 'q1', question: { text: 'What is 2+2?', marks: 5, type: 'single_mcq', difficulty: 'easy' } },
                  { questionId: 'q2', question: { text: 'Reverse a string', marks: 10, type: 'code', difficulty: 'hard' } },
                ],
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

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
    expect(screen.getByText('Reverse a string')).toBeInTheDocument();
    // Marks render in their own table column as plain numbers now.
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it("filters a section's questions by search text and by type", async () => {
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
                questions: [
                  { questionId: 'q1', question: { text: 'What is 2+2?', marks: 5, type: 'single_mcq', difficulty: 'easy' } },
                  { questionId: 'q2', question: { text: 'Reverse a string', marks: 10, type: 'code', difficulty: 'hard' } },
                ],
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

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Search this section's questions"), 'reverse');
    expect(screen.queryByText('What is 2+2?')).not.toBeInTheDocument();
    expect(screen.getByText('Reverse a string')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Search this section's questions"));
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Type'));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    expect(screen.queryByText('What is 2+2?')).not.toBeInTheDocument();
    expect(screen.getByText('Reverse a string')).toBeInTheDocument();
  });

  it('shows a pool summary instead of a question list for a pool-mode section', async () => {
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
                title: 'Reasoning',
                orderIndex: 0,
                selectionMode: 'pool',
                poolSize: 5,
                poolDifficulty: 'medium',
                targetDurationMinutes: null,
                questions: [],
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

    await waitFor(() => expect(screen.getByText('Pool of 5 questions (medium)')).toBeInTheDocument());
  });

  it('duplicates a section via the more-actions menu', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/sections/s-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 's-2', title: 'Section One (Copy)' }), { status: 201 });
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
              { id: 's-1', examId: 'exam-1', title: 'Section One', orderIndex: 0, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, questions: [] },
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
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Duplicate'));

    await waitFor(() => expect(screen.getByText('Section duplicated.')).toBeInTheDocument());
  });

  it('deletes a section after confirming in the dialog', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/sections/s-1') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({}), { status: 200 });
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
              { id: 's-1', examId: 'exam-1', title: 'Section One', orderIndex: 0, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, questions: [] },
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
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Delete'));

    expect(screen.getByText('Delete section')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Section deleted.')).toBeInTheDocument());
    expect(screen.queryByText('Delete section')).not.toBeInTheDocument();
  });

  it('locks section/question editing once a candidate has started the exam', async () => {
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
            hasStartedAttempts: true,
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
    expect(screen.getByText(/locked because a candidate has already started this exam/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage questions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More Actions' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New Section Title')).not.toBeInTheDocument();
  });
});
