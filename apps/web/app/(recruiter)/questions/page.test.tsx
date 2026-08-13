import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

    // Regression guard: onCompleted invalidates ['questions'] before switching to Drafts. The
    // pending-drafts count query has no other trigger to refetch (it's mounted once, keyed only
    // on status=draft/pageSize=1, and carries the client's 30s staleTime) -- without the explicit
    // invalidation, a just-completed generation would leave the banner reporting a stale count.
    it('updates the pending-drafts count immediately when a generation completes, not after the 30s staleTime', async () => {
      let resolveJob: (value: Response) => void;
      const jobPromise = new Promise<Response>((resolve) => {
        resolveJob = resolve;
      });
      let jobLanded = false;
      const ACTIVE_SEED = { ...DRAFT_QUESTION, id: 'q-active-seed', status: 'active', aiGenerated: false, text: 'Seed active question' };

      const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/ai-generate') && options?.method === 'POST') {
          return new Response(JSON.stringify({ aiJobId: 'job-1' }), { status: 200 });
        }
        if (u.includes('/ai-jobs/job-1')) return jobPromise;
        if (u.includes('/tags')) return new Response(JSON.stringify([]), { status: 200 });
        // The count query (pageSize=1): 0 until the job lands, then a higher number.
        if (u.includes('/questions') && u.includes('pageSize=1')) {
          return new Response(
            JSON.stringify({ data: [], total: jobLanded ? 4 : 0, page: 1, pageSize: 1, totalPages: jobLanded ? 4 : 0 }),
            { status: 200 },
          );
        }
        if (u.includes('/questions') && u.includes('status=draft')) {
          return new Response(JSON.stringify({ data: [DRAFT_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [ACTIVE_SEED], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      // Settle on post-refresh content before clicking (see the trap noted in the polling test
      // above) -- the active list only renders once /auth/refresh has landed and re-enabled it.
      await screen.findByText('Seed active question');
      expect(screen.queryByText(/drafts awaiting review/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await userEvent.type(await screen.findByLabelText('Topic'), 'SQL joins');
      await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

      // Job is in flight -- confirms mutateAsync resolved and the poll is live before we land it.
      await screen.findByRole('button', { name: 'Close' });

      jobLanded = true;
      resolveJob!(
        new Response(
          JSON.stringify({
            id: 'job-1',
            type: 'ai-question-generation',
            status: 'completed',
            error: null,
            outputJson: JSON.stringify({ requested: 4, created: 4, dropped: [], questionIds: ['q1', 'q2', 'q3', 'q4'] }),
          }),
          { status: 200 },
        ),
      );

      await waitFor(() => expect(screen.getByText('4 drafts awaiting review')).toBeInTheDocument());
    });

    // Regression guard: "Back to Active" must reset page back to 1, not just flip the status.
    // Without it, a recruiter who discards the last draft on page 3 of Drafts lands on an empty
    // page 3 of Active (assuming Active even has 3 pages) instead of the real first page.
    it('resets to page 1 when returning to Active from a drained page of Drafts', async () => {
      const ACTIVE_QUESTION = { ...DRAFT_QUESTION, id: 'q-active', status: 'active', aiGenerated: false, text: 'Active question after reset' };
      const DRAFT_PAGE: Record<number, typeof DRAFT_QUESTION> = {
        1: { ...DRAFT_QUESTION, id: 'd1', text: 'Draft one' },
        2: { ...DRAFT_QUESTION, id: 'd2', text: 'Draft two' },
        3: { ...DRAFT_QUESTION, id: 'd3', text: 'Draft three' },
      };
      let page3Drained = false;

      const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions/d3/archive') && options?.method === 'POST') {
          page3Drained = true;
          return new Response(JSON.stringify({ id: 'd3' }), { status: 200 });
        }
        if (u.includes('/questions') && u.includes('status=draft') && u.includes('page=3')) {
          return page3Drained
            ? new Response(JSON.stringify({ data: [], total: 2, page: 3, pageSize: 20, totalPages: 3 }), { status: 200 })
            : new Response(JSON.stringify({ data: [DRAFT_PAGE[3]], total: 3, page: 3, pageSize: 20, totalPages: 3 }), { status: 200 });
        }
        if (u.includes('/questions') && u.includes('status=draft') && u.includes('page=2')) {
          return new Response(JSON.stringify({ data: [DRAFT_PAGE[2]], total: 3, page: 2, pageSize: 20, totalPages: 3 }), { status: 200 });
        }
        if (u.includes('/questions') && u.includes('status=draft')) {
          return new Response(JSON.stringify({ data: [DRAFT_PAGE[1]], total: 3, page: 1, pageSize: 20, totalPages: 3 }), { status: 200 });
        }
        // A regression (missing setPage(1)) lands here -- the explicit assertion below checks
        // this request is never made at all, on top of the empty result steering the UI away
        // from the active content the test waits for.
        if (u.includes('/questions') && u.includes('status=active') && u.includes('page=3')) {
          return new Response(JSON.stringify({ data: [], total: 1, page: 3, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [ACTIVE_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPage();
      await screen.findByText('Active question after reset');

      await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));
      await screen.findByText('Draft one');

      await userEvent.click(screen.getByRole('button', { name: '3' }));
      await screen.findByText('Draft three');

      await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
      await screen.findByText('No drafts to review.');

      await userEvent.click(screen.getByRole('button', { name: 'Back to Active' }));

      await waitFor(() => expect(screen.getByText('Active question after reset')).toBeInTheDocument());
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes('status=active') && String(call[0]).includes('page=3')),
      ).toBe(false);
    });

    // The empty-state escape is written for any non-active status, but only the Drafts path
    // above is covered -- this is the Archived equivalent, so the `status !== 'active'` branch
    // doesn't quietly regress to a draft-only check.
    it('offers a way back to Active from an empty Archived view', async () => {
      const ACTIVE_QUESTION = { ...DRAFT_QUESTION, id: 'q-active', status: 'active', aiGenerated: false };
      global.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        if (u.includes('/questions') && u.includes('status=archived')) {
          return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
        }
        if (u.includes('/questions')) {
          return new Response(JSON.stringify({ data: [ACTIVE_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;

      renderPage();
      await screen.findByText('What does an AI-generated question look like?');

      await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Archived' }));

      expect(await screen.findByText('No archived questions.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Back to Active' }));

      await waitFor(() => expect(screen.getByText('What does an AI-generated question look like?')).toBeInTheDocument());
    });

    describe('bulk publish and discard', () => {
      const DRAFT_1 = DRAFT_QUESTION;
      const DRAFT_2 = { ...DRAFT_QUESTION, id: 'q2', text: 'A second draft question' };

      function renderDraftsPage() {
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

      it('publishes every selected draft', async () => {
        const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions/q1/publish') && options?.method === 'POST') {
            return new Response(JSON.stringify({ id: 'q1' }), { status: 200 });
          }
          if (u.includes('/questions/q2/publish') && options?.method === 'POST') {
            return new Response(JSON.stringify({ id: 'q2' }), { status: 200 });
          }
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [DRAFT_1, DRAFT_2], total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        await userEvent.click(await screen.findByLabelText('Select question q1'));
        await userEvent.click(screen.getByLabelText('Select question q2'));
        await userEvent.click(screen.getByRole('button', { name: 'Publish selected (2)' }));

        await waitFor(() => {
          expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions/q1/publish'))).toBe(true);
          expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/questions/q2/publish'))).toBe(true);
        });
      });

      it('does not offer bulk actions outside the Drafts view', async () => {
        const ACTIVE_QUESTION = { ...DRAFT_QUESTION, id: 'q1', status: 'active', aiGenerated: false };
        global.fetch = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [ACTIVE_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        renderDraftsPage();
        await screen.findByText(ACTIVE_QUESTION.text);
        expect(screen.queryByLabelText('Select question q1')).not.toBeInTheDocument();
      });

      // The recruiter must never be told "published 7" when only some landed -- these are N
      // separate requests (no batch endpoint exists), so a mid-batch failure has to be reported
      // honestly rather than swallowed or treated as an all-or-nothing result.
      it('reports a partial failure without claiming full success', async () => {
        const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions/q1/publish') && options?.method === 'POST') {
            return new Response(JSON.stringify({ id: 'q1' }), { status: 200 });
          }
          if (u.includes('/questions/q2/publish') && options?.method === 'POST') {
            return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
          }
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [DRAFT_1, DRAFT_2], total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        await userEvent.click(await screen.findByLabelText('Select question q1'));
        await userEvent.click(screen.getByLabelText('Select question q2'));
        await userEvent.click(screen.getByRole('button', { name: 'Publish selected (2)' }));

        expect(await screen.findByText('1 of 2 published — 1 failed.')).toBeInTheDocument();
      });

      // Requirement from the brief: a selection carried across a status-filter change would act
      // on rows the recruiter can no longer see. Round-tripping Drafts -> Active -> Drafts must
      // land back with nothing selected and no leftover bulk-action bar.
      it('clears the selection when the status filter changes away and back', async () => {
        const ACTIVE_QUESTION = { ...DRAFT_QUESTION, id: 'q-active', status: 'active', aiGenerated: false, text: 'An active question' };
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions') && u.includes('status=draft')) {
            return new Response(JSON.stringify({ data: [DRAFT_1, DRAFT_2], total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [ACTIVE_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await screen.findByText('An active question');

        await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));
        await userEvent.click(await screen.findByLabelText('Select question q1'));
        expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Active' }));
        await screen.findByText('An active question');
        expect(screen.queryByRole('button', { name: /Publish selected/ })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        await screen.findByLabelText('Select question q1');
        expect(screen.queryByRole('button', { name: /Publish selected/ })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Select question q1')).not.toBeChecked();
      });

      // Requirement from the brief: bulk publishing every draft leaves the Drafts view empty --
      // the existing "Back to Active" escape must still work, and no selection (or bulk-action
      // bar) should linger once the list drains.
      it('leaves Back to Active working, with no lingering selection, once bulk publishing empties the Drafts list', async () => {
        let published = false;
        const ACTIVE_QUESTION = { ...DRAFT_QUESTION, id: 'q-active', status: 'active', aiGenerated: false, text: 'An active question' };
        const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions/q1/publish') && options?.method === 'POST') {
            published = true;
            return new Response(JSON.stringify({ id: 'q1' }), { status: 200 });
          }
          if (u.includes('/questions') && u.includes('status=draft')) {
            return published
              ? new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 })
              : new Response(JSON.stringify({ data: [DRAFT_1], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [ACTIVE_QUESTION], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await screen.findByText('An active question');

        await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));
        await userEvent.click(await screen.findByLabelText('Select question q1'));
        await userEvent.click(screen.getByRole('button', { name: 'Publish selected (1)' }));

        expect(await screen.findByText('No drafts to review.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Publish selected/ })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Back to Active' }));
        await waitFor(() => expect(screen.getByText('An active question')).toBeInTheDocument());
      });

      // Regression for the invariant: a bulk action must never touch a row the recruiter cannot
      // currently see. Grouped view renders one <Table> per group, each with its own select-all
      // bound only to that group's rows -- checking Arrays' select-all while Trees is collapsed
      // must select only Arrays' draft, never reach into Trees (which never even mounted).
      it('scopes a group select-all to its own group, never reaching into another (unrendered) group', async () => {
        const GROUPED_DRAFT_1 = { ...DRAFT_1, topic: 'Arrays' };
        const GROUPED_DRAFT_2 = { ...DRAFT_2, topic: 'Trees' };
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [GROUPED_DRAFT_1, GROUPED_DRAFT_2], total: 2, page: 1, pageSize: 100, totalPages: 1 }), {
              status: 200,
            });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
        await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

        // Only Arrays is expanded -- Trees (and its draft) never renders.
        await userEvent.click(screen.getByRole('button', { name: /Arrays/ }));
        await userEvent.click(await screen.findByLabelText('Select all questions in Arrays'));

        // Only the one visible, Arrays-only row is selected.
        expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeInTheDocument();

        // Now expand Trees too -- if Arrays' select-all had wrongly reached into it, its
        // checkbox would already be checked here.
        await userEvent.click(screen.getByRole('button', { name: /Trees/ }));
        expect(screen.getByLabelText('Select question q2')).not.toBeChecked();
        expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeInTheDocument();
      });

      // Regression for the invariant itself: collapsing a group is the normal interaction in a
      // grouped view, not a corner case -- its rows stay in `rows` (the fetched page) even though
      // nothing renders. The bulk-action bar must disappear the moment the selected rows leave
      // the DOM, not keep offering to act on rows the recruiter can no longer see.
      it('hides the bulk-action bar once its selected rows are hidden by collapsing their group', async () => {
        const GROUPED_DRAFT_1 = { ...DRAFT_1, topic: 'Arrays' };
        const GROUPED_DRAFT_2 = { ...DRAFT_2, topic: 'Arrays' };
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [GROUPED_DRAFT_1, GROUPED_DRAFT_2], total: 2, page: 1, pageSize: 100, totalPages: 1 }), {
              status: 200,
            });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
        await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

        const arraysHeading = screen.getByRole('button', { name: /Arrays/ });
        await userEvent.click(arraysHeading);
        await userEvent.click(await screen.findByLabelText('Select question q1'));
        await userEvent.click(screen.getByLabelText('Select question q2'));
        expect(screen.getByRole('button', { name: 'Discard selected (2)' })).toBeInTheDocument();

        // Collapse the group -- both selected rows leave the DOM, but selectedIds still holds them.
        await userEvent.click(arraysHeading);

        // The bulk-action bar must disappear entirely rather than keep offering an action
        // against rows that are no longer on screen.
        expect(screen.queryByRole('button', { name: /Discard selected/ })).not.toBeInTheDocument();
      });

      // Regression for the same invariant via the other proven path: the selection is made
      // *before* grouping is turned on, not by collapsing an already-grouped view. Switching
      // Group By resets neither [status, page, search] (so the selectedIds-clearing effect never
      // fires) nor expandedGroups, so every group starts collapsed with both previously-visible,
      // previously-selected rows now off-screen -- the bulk-action bar must disappear. Expanding
      // one group afterward must report the count for exactly its own now-visible row, not the
      // stale 2 -- that distinguishes "the selection was hidden" from "the selection was
      // silently thrown away".
      it('hides the bulk-action bar when grouping collapses a selection made while ungrouped, then shows the right count once a group reopens', async () => {
        const GROUPED_DRAFT_1 = { ...DRAFT_1, topic: 'Arrays' };
        const GROUPED_DRAFT_2 = { ...DRAFT_2, topic: 'Trees' };
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [GROUPED_DRAFT_1, GROUPED_DRAFT_2], total: 2, page: 1, pageSize: 100, totalPages: 1 }), {
              status: 200,
            });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        // Select both drafts while still ungrouped -- both rows are on screen.
        await userEvent.click(await screen.findByLabelText('Select question q1'));
        await userEvent.click(screen.getByLabelText('Select question q2'));
        expect(screen.getByRole('button', { name: 'Publish selected (2)' })).toBeInTheDocument();

        // Turn on Topic grouping -- both groups start collapsed, so both selected rows leave the
        // DOM in the same tick even though selectedIds still holds both ids.
        await userEvent.click(screen.getByRole('combobox', { name: 'Group By' }));
        await userEvent.click(screen.getByRole('option', { name: 'Topic' }));

        expect(screen.queryByRole('button', { name: /Publish selected/ })).not.toBeInTheDocument();

        // Expand Arrays -- only its one selected row (q1) is visible now.
        await userEvent.click(screen.getByRole('button', { name: /Arrays/ }));

        expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeInTheDocument();
      });

      // Regression: setSelectedIds(new Set()) only ran off [status, page] -- typing into search
      // calls setPage(1), a no-op when already on page 1, so a selection survived a search that
      // filtered its row out of view entirely.
      it('clears the selection when the search text changes', async () => {
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [DRAFT_1, DRAFT_2], total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));
        await userEvent.click(await screen.findByLabelText('Select question q1'));
        expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search Questions'), { target: { value: 'second' } });

        await waitFor(() => expect(screen.queryByRole('button', { name: /Publish selected/ })).not.toBeInTheDocument());
      });

      // Regression: the chooser filtered on `column.header !== ''`, and the select column's header
      // is JSX (never the empty string), so it was listed -- hiding it via the chooser removed
      // every row checkbox with no way back short of clearing localStorage.
      it('never offers the selection column in the column chooser', async () => {
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [DRAFT_1, DRAFT_2], total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));
        await screen.findByLabelText('Select question q1');

        await userEvent.click(screen.getByRole('button', { name: 'Choose Columns' }));

        expect(screen.queryByRole('menuitemcheckbox', { name: '__select' })).not.toBeInTheDocument();
        // The chooser did open and lists real data columns -- it just skips the selection one.
        expect(screen.getByRole('menuitemcheckbox', { name: 'Type' })).toBeInTheDocument();
      });

      // "Select all questions" claimed the whole filtered set but only ever acted on the current
      // page -- at the 20-plus-drafts-across-pages scale bulk actions exist for, that's a
      // misleading promise on a control whose neighbour is destructive (Discard).
      it('labels select-all for what it actually does -- the current page, not the whole filtered set', async () => {
        const fetchMock = jest.fn(async (url) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions')) {
            return new Response(JSON.stringify({ data: [DRAFT_1, DRAFT_2], total: 2, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        expect(await screen.findByLabelText('Select all questions on this page')).toBeInTheDocument();
      });

      // Regression: nothing pruned selectedIds against rows. Selecting q1 and q2, then publishing
      // q1 via its per-row action, used to leave the bar reading "Publish selected (2)" and the
      // bulk action resubmitting POST /questions/q1/publish a second time -- with a success toast
      // claiming 2 published when only q2 was still on screen.
      it('drops an id from the bulk count and re-submission once its own row is no longer visible', async () => {
        let q1Published = false;
        const publishCalls: string[] = [];
        const fetchMock = jest.fn(async (url, options: RequestInit | undefined) => {
          const u = String(url);
          if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
          if (u.includes('/questions/q1/publish') && options?.method === 'POST') {
            publishCalls.push('q1');
            q1Published = true;
            return new Response(JSON.stringify({ id: 'q1' }), { status: 200 });
          }
          if (u.includes('/questions/q2/publish') && options?.method === 'POST') {
            publishCalls.push('q2');
            return new Response(JSON.stringify({ id: 'q2' }), { status: 200 });
          }
          if (u.includes('/questions')) {
            return new Response(
              JSON.stringify({
                data: q1Published ? [DRAFT_2] : [DRAFT_1, DRAFT_2],
                total: q1Published ? 1 : 2,
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

        renderDraftsPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Filter by Status' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Drafts' }));

        await userEvent.click(await screen.findByLabelText('Select question q1'));
        await userEvent.click(screen.getByLabelText('Select question q2'));
        expect(screen.getByRole('button', { name: 'Publish selected (2)' })).toBeInTheDocument();

        // Per-row Publish on q1's row specifically -- not the bulk button.
        const q1Row = screen.getByText(DRAFT_1.text).closest('tr')!;
        await userEvent.click(within(q1Row).getByRole('button', { name: 'Publish' }));
        await waitFor(() => expect(screen.queryByText(DRAFT_1.text)).not.toBeInTheDocument());

        // The bar must now count only what's actually still on screen.
        expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Publish selected (1)' }));

        await waitFor(() => expect(publishCalls).toContain('q2'));
        expect(publishCalls.filter((id) => id === 'q1')).toHaveLength(1);
      });
    });
  });
});
