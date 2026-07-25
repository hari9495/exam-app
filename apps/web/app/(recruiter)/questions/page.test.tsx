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
        <AuthProvider>
          <QuestionsPage />
        </AuthProvider>
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
        <AuthProvider>
          <QuestionsPage />
        </AuthProvider>
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
        <AuthProvider>
          <QuestionsPage />
        </AuthProvider>
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

    fireEvent.change(screen.getByLabelText('Search questions'), { target: { value: 'onboarding' } });

    // If page.tsx reverted to filtering an already-fetched array client-side,
    // no request carrying the typed text would ever be made -- this fails in
    // that case, unlike an assertion that only checks the rendered rows.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions') && String(call[0]).includes('search=onboarding'))).toBe(true),
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

    it('shows the candidate-style answer options inline, without opening the editor', async () => {
      mockQuestions();
      renderPage();

      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());
      expect(screen.getByText('B. 63')).toBeInTheDocument();
      expect(screen.getAllByLabelText('Correct answer').length).toBeGreaterThan(0);
    });

    it('groups questions under topic headings with per-group counts when Topic is picked', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

      expect(screen.getByRole('heading', { name: 'Percentages' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Ratios' })).toBeInTheDocument();
      expect(screen.getByText('1 question · 2 marks')).toBeInTheDocument();
    });

    it('orders difficulty groups easy to hard rather than alphabetically', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Difficulty' }));

      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
      expect(headings).toEqual(['Easy', 'Hard']);
    });

    it('groups untagged questions into a trailing no-tags heading', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Tag' }));

      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
      expect(headings).toEqual(['Arithmetic', 'No tags']);
    });

    it('keeps the sort control available while grouped, so rows sort within each group', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Category' }));

      expect(screen.getByRole('heading', { name: 'Aptitude' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    });

    it('switches to the dense list view and expands a row to reveal its options', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: /^List$/ }));

      // Collapsed list rows show the question text but not the answer options.
      expect(screen.queryByText('A. 45')).not.toBeInTheDocument();
      const rowToggles = screen.getAllByRole('button', { expanded: false });
      await userEvent.click(rowToggles[0]);

      expect(screen.getByText('A. 45')).toBeInTheDocument();
      expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
    });

    it('marks the active view in the cards/list toggle', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      expect(screen.getByRole('button', { name: /^Cards$/, pressed: true })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /^List$/ }));

      expect(screen.getByRole('button', { name: /^List$/, pressed: true })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Cards$/, pressed: false })).toBeInTheDocument();
    });

    it('applies the chosen sort order to the list view as well as cards', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText('A. 45')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: /^List$/ }));
      await userEvent.click(screen.getByRole('combobox', { name: 'Sort by' }));
      await userEvent.click(screen.getByRole('option', { name: 'Marks' }));

      // q-2 carries 1 mark and q-1 carries 2, so ascending marks puts q-2 first.
      const texts = screen.getAllByRole('button', { expanded: false }).map((button) => button.textContent);
      expect(texts[0]).toContain('If 20% of a number is 50');
      expect(texts[1]).toContain('Two numbers are in the ratio 4:5');
    });
  });
});
