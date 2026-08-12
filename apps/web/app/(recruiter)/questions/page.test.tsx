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

    it('starts each group collapsed, and expands it on clicking the heading', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

      const ratiosHeading = screen.getByRole('button', { name: /Ratios/ });
      expect(ratiosHeading).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText(/Two numbers are in the ratio/)).not.toBeInTheDocument();

      await userEvent.click(ratiosHeading);

      expect(ratiosHeading).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument();
      // The other group (Percentages) is untouched -- still collapsed.
      expect(screen.queryByText(/If 20% of a number is 50/)).not.toBeInTheDocument();
    });

    it('numbers questions 1-based within their own group, not as a running count across groups', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
      await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

      await userEvent.click(screen.getByRole('button', { name: /Ratios/ }));
      const ratiosRow = screen.getByText(/Two numbers are in the ratio/).closest('tr');
      expect(ratiosRow).toHaveTextContent('1');

      await userEvent.click(screen.getByRole('button', { name: /Percentages/ }));
      const percentagesRow = screen.getByText(/If 20% of a number is 50/).closest('tr');
      expect(percentagesRow).toHaveTextContent('1');
    });

    it('opens a delete confirmation from a question row action', async () => {
      mockQuestions();
      renderPage();
      await waitFor(() => expect(screen.getByText(/Two numbers are in the ratio/)).toBeInTheDocument());

      // Each row exposes a Delete action; clicking it opens the confirmation dialog.
      await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
      expect(screen.getByText('Delete Question')).toBeInTheDocument();
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

  describe('drafts', () => {
    const DRAFT_QUESTION = {
      id: 'q1',
      type: 'single_mcq',
      text: 'What does an AI-generated question look like?',
      topic: null,
      category: null,
      difficulty: 'easy',
      marks: 1,
      negativeMarks: 0,
      status: 'draft',
      aiGenerated: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      options: [],
    };

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

    it('offers Drafts as a status filter', async () => {
      // The Status column header (and its filter) lives inside the Table, which only renders
      // once there's at least one row -- an empty result set never shows the filter at all.
      const ACTIVE_QUESTION = { ...DRAFT_QUESTION, id: 'q-active', status: 'active', aiGenerated: false };
      global.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [ACTIVE_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
      expect(await screen.findByRole('menuitem', { name: 'Drafts' })).toBeInTheDocument();
    });

    // Regression guard: the status column used to be a two-way active/archived ternary, which
    // rendered any non-active question (including a draft) as "Archived" -- wrong and alarming
    // for a recruiter reviewing AI output. Asserting the exact "Draft" text (not just "not
    // Archived") is what makes this fail if the ternary ever goes back to two-way.
    it('shows a Draft badge and a Publish action on a draft row', async () => {
      global.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [DRAFT_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;

      renderPage();
      expect(await screen.findByText('Draft')).toBeInTheDocument();
      expect(screen.queryByText('Archived')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    });

    // Regression guard: Publish must go through the existing publish endpoint (useRestoreQuestion),
    // never a DELETE. If the button were wired to archiveQuestion instead, this fails because the
    // request would hit /archive, not /publish.
    it('publishes a draft through the existing publish endpoint', async () => {
      const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/q1/publish') && options?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'q1' }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [DRAFT_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));

      await waitFor(() =>
        expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions/q1/publish'))).toBe(true),
      );
      // Discard must never hit a DELETE -- there is no delete endpoint for a question.
      expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
    });

    it('discards a draft through the existing archive endpoint, not a delete', async () => {
      const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/q1/archive') && options?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'q1' }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [DRAFT_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));

      await waitFor(() =>
        expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions/q1/archive'))).toBe(true),
      );
    });

    // Discard was previously fire-and-forget (archiveQuestion.mutate with no onSuccess/onError),
    // so a failed request left the row sitting there with no feedback at all.
    it('toasts an error when discarding a draft fails', async () => {
      global.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/q1/archive')) {
          return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [DRAFT_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));

      expect(await screen.findByText('Server error')).toBeInTheDocument();
    });

    // Regression guard for the trap: once the Drafts list is drained (the designed happy path --
    // onCompleted switches to Drafts, then Publish/Discard empties it), status is stuck on
    // 'draft', the pending-count link is gone (count is 0), and the Status filter itself only
    // lives inside <Table>, which is skipped when there are no rows. Without a way back on the
    // empty state, only a page reload recovers.
    it('offers a way back to Active from an empty Drafts view', async () => {
      global.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions') && u.includes('status=draft')) {
          return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [{ ...DRAFT_QUESTION, id: 'q-active', status: 'active' }], total: 1, page: 1, pageSize: 20, totalPages: 1 }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

      expect(await screen.findByText('No drafts to review.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Back to Active' }));

      await waitFor(() => expect(screen.getByText('What does an AI-generated question look like?')).toBeInTheDocument());
    });

    it('shows how many drafts are waiting, so they are not forgotten behind a filter', async () => {
      global.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions') && u.includes('status=draft')) {
          return new Response(JSON.stringify({ data: [], total: 3, page: 1, pageSize: 1, totalPages: 3 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;

      renderPage();
      expect(await screen.findByText('3 drafts awaiting review')).toBeInTheDocument();
    });

    it('clicking the pending-drafts count switches the list to the Drafts filter', async () => {
      const fetchMock = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions') && u.includes('status=draft')) {
          return new Response(JSON.stringify({ data: [], total: 2, page: 1, pageSize: 1, totalPages: 2 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      await userEvent.click(await screen.findByText('2 drafts awaiting review'));

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            (call) => String(call[0]).includes('/questions?') && String(call[0]).includes('status=draft') && String(call[0]).includes('pageSize=20'),
          ),
        ).toBe(true),
      );
    });

    // The critical wiring from the brief: GenerateQuestionsModal must be mounted unconditionally
    // (`<GenerateQuestionsModal open={...} />`), never `{open && <Modal/>}`. Closing the modal
    // must not unmount it, or the in-flight job's poll dies and onCompleted never fires. This test
    // starts a job, closes the modal (Cancel/Close, not the completion), *then* lets the job
    // resolve as completed -- only a still-mounted component keeps polling and switches the page
    // to Drafts afterward.
    it('keeps polling a generation job after the modal is closed, and switches to Drafts when it completes', async () => {
      let resolveJob: (value: Response) => void;
      const jobPromise = new Promise<Response>((resolve) => {
        resolveJob = resolve;
      });

      const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/ai-generate') && options?.method === 'POST') {
          return new Response(JSON.stringify({ aiJobId: 'job-1' }), { status: 200 });
        }
        if (u.includes('/ai-jobs/job-1')) {
          return jobPromise;
        }
        if (u.includes('/tags')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (u.includes('/questions') && u.includes('status=draft')) {
          return new Response(JSON.stringify({ data: [DRAFT_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      // Settle first: at first render accessToken is null, so both useQuestions calls are
      // enabled: false and isLoading is false -- the page (and the button) is fully rendered.
      // When /auth/refresh lands the queries enable, isLoading flips true, and the page's
      // `if (isLoading) return ...` early-return unmounts the whole subtree, destroying that
      // button node. Waiting for content that only appears post-refresh (the draft count) means
      // we're clicking the button that survives, not the one about to be torn down.
      await screen.findByText('1 draft awaiting review');
      await userEvent.click(await screen.findByRole('button', { name: 'Generate with AI' }));
      await userEvent.type(await screen.findByLabelText('Topic'), 'SQL joins');
      await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

      // Job is in flight (aiJobId set, poll not yet resolved) -- the button reads "Close" now.
      await userEvent.click(await screen.findByRole('button', { name: 'Close' }));

      // The dialog itself is gone from the accessibility tree...
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // ...but the job resolves as completed only now, after the close click.
      resolveJob!(
        new Response(
          JSON.stringify({
            id: 'job-1',
            type: 'ai-question-generation',
            status: 'completed',
            error: null,
            outputJson: JSON.stringify({ requested: 1, created: 1, dropped: [], questionIds: ['q1'] }),
          }),
          { status: 200 },
        ),
      );

      // onCompleted only fires (and switches the filter to Drafts) if the modal component --
      // and its aiJobId state and useAiJob poll -- survived the close, i.e. stayed mounted.
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions?') && String(call[0]).includes('status=draft')),
        ).toBe(true),
      );
      expect(await screen.findByText('What does an AI-generated question look like?')).toBeInTheDocument();
    });
  });
});
