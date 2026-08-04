import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('QuestionsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists questions returned by the API', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'q-1',
                type: 'single_mcq',
                text: 'What is 2+2?',
                topic: null,
                category: null,
                difficulty: 'easy',
                marks: 5,
                negativeMarks: 0,
                status: 'active',
                aiGenerated: false,
                createdAt: '2026-01-01T00:00:00.000Z',
                options: [],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/tags')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
  });

  it('shows loading state while questions are fetching', async () => {
    let resolveQuestions: (value: any) => void;
    const questionsPromise = new Promise((resolve) => {
      resolveQuestions = resolve;
    });

    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        await questionsPromise;
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument(), { timeout: 2000 });
    resolveQuestions!(null);

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });

  it('shows error state when question fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load questions.')).toBeInTheDocument();
  });

  it('shows a type badge and difficulty indicator for each question', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'q-1', text: 'Two Sum', type: 'code', difficulty: 'medium', marks: 5 }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
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
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('sends the typed search text to the server as a query param instead of filtering client-side', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'q-1',
                type: 'single_mcq',
                text: 'What is 2+2?',
                topic: null,
                category: null,
                difficulty: 'easy',
                marks: 5,
                negativeMarks: 0,
                status: 'active',
                aiGenerated: false,
                createdAt: '2026-01-01T00:00:00.000Z',
                options: [],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
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
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search Questions'), { target: { value: 'onboarding' } });

    // If page.tsx reverted to filtering an already-fetched array client-side,
    // no request carrying the typed text would ever be made -- this fails in
    // that case, unlike an assertion that only checks the rendered rows.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions') && String(call[0]).includes('search=onboarding'))).toBe(true),
    );
  });

  it('shows a Status column and sends the selected status filter to the server as a query param', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'q-1',
                type: 'single_mcq',
                text: 'What is 2+2?',
                topic: null,
                category: null,
                difficulty: 'easy',
                marks: 5,
                negativeMarks: 0,
                status: 'active',
                aiGenerated: false,
                createdAt: '2026-01-01T00:00:00.000Z',
                options: [],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
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
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );
    await waitFor(() => expect(screen.getByText('What is 2+2?')).toBeInTheDocument());
    expect(screen.getByText('Active')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archived' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions') && String(call[0]).includes('status=archived'))).toBe(true),
    );
  });

  describe('preview and grouping', () => {
    const QUESTIONS = [
      {
        id: 'q-1',
        type: 'single_mcq',
        text: 'Two numbers are in the ratio 4:5. If their LCM is 140, what is the sum?',
        topic: 'Ratios',
        category: 'Aptitude',
        difficulty: 'hard',
        marks: 2,
        negativeMarks: 0,
        status: 'active',
        aiGenerated: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        options: [
          { id: 'o1', text: '45', isCorrect: false, imageUrl: null },
          { id: 'o2', text: '63', isCorrect: true, imageUrl: null },
        ],
        tags: [{ id: 't1', name: 'Arithmetic' }],
      },
      {
        id: 'q-2',
        type: 'single_mcq',
        text: 'If 20% of a number is 50, what is 35% of that number?',
        topic: 'Percentages',
        category: 'Aptitude',
        difficulty: 'easy',
        marks: 1,
        negativeMarks: 0,
        status: 'active',
        aiGenerated: false,
        createdAt: '2026-01-02T00:00:00.000Z',
        options: [{ id: 'o3', text: '87.5', isCorrect: true, imageUrl: null }],
        tags: [],
      },
    ];

    function mockQuestions() {
      global.fetch = jest.fn(async (url) => {
        if (String(url).endsWith('/auth/refresh')) {
          return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        }
        if (String(url).includes('/questions')) {
          return new Response(JSON.stringify({ data: QUESTIONS, total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;
    }

    function renderPage() {
      render(
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <QuestionsPage />
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>,
      );
    }

    it('renders each question as a row in the table', async () => {
      mockQuestions();
      renderPage();

      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());
      expect(screen.getByText(/If 20% of a number is 50/)).toBeInTheDocument();
    });

    it('groups questions under topic headings with per-group counts when Topic is picked', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

      expect(screen.getByRole('heading', { name: 'Percentages' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Ratios' })).toBeInTheDocument();
      expect(screen.getByText('1 question · 2 marks')).toBeInTheDocument();
    });

    // Regression for ADO #6843: grouping only counted whatever happened to be on the current
    // 20-row page, so a topic with 15 real questions could show a much smaller count if most of
    // them were on other pages. Widening the fetch while grouped (and pinning to page 1) makes
    // the counts reflect the whole filtered set instead of one page of it.
    it('requests a wider page (and pins to page 1) once a Group By is picked, so counts reflect the whole filtered set', async () => {
      const fetchMock = jest.fn(async (url) => {
        if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (String(url).includes('/questions')) {
          return new Response(JSON.stringify({ data: QUESTIONS, total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      const initialCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/questions'));
      expect(String(initialCall![0])).toContain('pageSize=20');

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

      await waitFor(() => {
        const groupedCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('pageSize=100'));
        expect(groupedCall).toBeDefined();
        expect(String(groupedCall![0])).toContain('page=1');
      });
    });

    it('orders difficulty groups easy to hard rather than alphabetically', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Difficulty' }));

      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
      expect(headings).toEqual(['Easy', 'Hard']);
    });

    it('groups untagged questions into a trailing no-tags heading', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Tag' }));

      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
      expect(headings).toEqual(['Arithmetic', 'No tags']);
    });

    it('groups by category under a heading', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Category' }));

      // Both questions are category "Aptitude", so they collapse under one heading.
      expect(screen.getByRole('heading', { name: 'Aptitude' })).toBeInTheDocument();
    });

    it('opens a delete confirmation from a question row action', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      // Each row exposes a Delete action; clicking it opens the confirmation dialog.
      await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
      expect(screen.getByText('Delete question')).toBeInTheDocument();
    });

    it('shows a Restore action for archived questions and re-publishes on click', async () => {
      const archived = [{ ...QUESTIONS[0], status: 'archived' }];
      const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/q-1/publish') && options?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'q-1' }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: archived, total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      // An archived question shows Restore (not Delete); clicking it hits the publish endpoint.
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
      await waitFor(() =>
        expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions/q-1/publish'))).toBe(true),
      );
    });
  });
});
