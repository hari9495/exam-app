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
    await userEvent.click(screen.getByRole('button', { name: /save questions/i }));

    const putCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes('/exams/exam-1/sections/s-1/questions') && call[1]?.method === 'PUT',
    );
    await waitFor(() => expect(putCall).toBeDefined());
    expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({ questionIds: ['q-1'] });
  });

  it('hides questions already in the section and merges the rest on save (add-only)', async () => {
    const question = (id: string, text: string) => ({
      id, type: 'single_mcq', text, topic: null, category: null, difficulty: 'easy',
      marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [],
    });
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({ data: [question('q-1', 'Already added'), question('q-2', 'Brand new')], total: 2, page: 1, pageSize: 100, totalPages: 1 }),
          { status: 200 },
        );
      }
      if (options?.method === 'PUT') return new Response(JSON.stringify({ success: true }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={['q-1']} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    // The already-added question is not offered; only the new one is.
    await waitFor(() => expect(screen.getByText('Brand new')).toBeInTheDocument());
    expect(screen.queryByText('Already added')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Brand new/ }));
    await userEvent.click(screen.getByRole('button', { name: /save questions/i }));

    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
    await waitFor(() => expect(putCall).toBeDefined());
    // Saved set is the union: existing q-1 preserved + newly picked q-2.
    expect(JSON.parse((putCall![1] as RequestInit).body as string).questionIds.sort()).toEqual(['q-1', 'q-2']);
  });

  it('filters the list by the search box', async () => {
    const question = (id: string, text: string) => ({
      id, type: 'single_mcq', text, topic: null, category: null, difficulty: 'easy',
      marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [],
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({ data: [question('q-1', 'Reverse a string'), question('q-2', 'Prime numbers')], total: 2, page: 1, pageSize: 100, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={[]} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Reverse a string')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/search by text/i), 'prime');
    expect(screen.queryByText('Reverse a string')).not.toBeInTheDocument();
    expect(screen.getByText('Prime numbers')).toBeInTheDocument();
  });

  it('filters the list by type and by difficulty', async () => {
    const question = (overrides: Partial<{ id: string; text: string; type: string; difficulty: string }>) => ({
      id: 'q', type: 'single_mcq', text: 'text', topic: null, category: null, difficulty: 'easy',
      marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [],
      ...overrides,
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              question({ id: 'q-1', text: 'Reverse a string', type: 'code', difficulty: 'hard' }),
              question({ id: 'q-2', text: 'Prime numbers', type: 'single_mcq', difficulty: 'easy' }),
            ],
            total: 2, page: 1, pageSize: 100, totalPages: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <SectionQuestionPicker examId="exam-1" sectionId="s-1" open onClose={() => {}} existingQuestionIds={[]} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Reverse a string')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Coding' }));
    expect(screen.getByText('Reverse a string')).toBeInTheDocument();
    expect(screen.queryByText('Prime numbers')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(screen.getByRole('option', { name: 'All types' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Difficulty' }));
    await userEvent.click(screen.getByRole('option', { name: 'Easy' }));
    expect(screen.queryByText('Reverse a string')).not.toBeInTheDocument();
    expect(screen.getByText('Prime numbers')).toBeInTheDocument();
  });

  it('shows an empty-bank message and blocks saving when there are no questions to pick from', async () => {
    const fetchMock = jest.fn(async (url, options?: RequestInit) => {
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
    await userEvent.click(screen.getByRole('button', { name: /save questions/i }));

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

  // Regression for #6837: selecting a long (wrapping) question, then selecting a
  // second one further down the list, must not un-select the first.
  it('keeps an earlier selection checked after selecting a later question with a long, wrapping label', async () => {
    const longText =
      'This is a deliberately long question stem that wraps across several lines in the narrow picker list, ' +
      'matching the kind of question text that triggered the misaligned-checkbox report in ADO #6837.';
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'q-1', type: 'single_mcq', text: longText, topic: null, category: null, difficulty: 'easy', marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [] },
              { id: 'q-2', type: 'single_mcq', text: 'A short second question', topic: null, category: null, difficulty: 'easy', marks: 5, negativeMarks: 0, status: 'active', aiGenerated: false, createdAt: '2026-01-01T00:00:00.000Z', options: [] },
            ],
            total: 2, page: 1, pageSize: 100, totalPages: 1,
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

    await waitFor(() => expect(screen.getByText('A short second question')).toBeInTheDocument());
    const first = screen.getByRole('checkbox', { name: new RegExp(longText.slice(0, 30)) });
    const second = screen.getByRole('checkbox', { name: /A short second question/ });

    await userEvent.click(first);
    expect(first).toBeChecked();

    await userEvent.click(second);
    expect(second).toBeChecked();
    expect(first).toBeChecked();
  });
});
