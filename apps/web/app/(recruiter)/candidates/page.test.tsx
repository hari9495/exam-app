import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidatesPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('CandidatesPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists candidates and sends a bulk invitation for a selected exam', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1/invitations') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({ created: [{ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', token: 'tok', status: 'invited' }], skipped: [] }),
          { status: 201 },
        );
      }
      if (String(url).endsWith('/exams?status=published&pageSize=100')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'exam-1', title: 'Backend Round', status: 'published', sections: [] }],
            total: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'cand-1', email: 'priya@example.com', name: 'Priya Shah', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }],
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
            <CandidatesPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /Priya Shah/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitations' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/exams/exam-1/invitations') && call[1]?.method === 'POST')).toBe(true),
    );
  });

  it('does not auto-select an exam when multiple are published, forcing an explicit pick', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-2/invitations') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({ created: [{ id: 'inv-1', examId: 'exam-2', candidateId: 'cand-1', token: 'tok', status: 'invited' }], skipped: [] }),
          { status: 201 },
        );
      }
      if (String(url).endsWith('/exams?status=published&pageSize=100')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'exam-1', title: 'Backend Round', status: 'published', sections: [] },
              { id: 'exam-2', title: 'Frontend Round', status: 'published', sections: [] },
            ],
            total: 2,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'cand-1', email: 'priya@example.com', name: 'Priya Shah', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }],
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
            <CandidatesPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /Priya Shah/ }));

    // With two published exams, neither is auto-selected: the combobox shows
    // neither exam title and the invite button stays disabled.
    const combobox = screen.getByRole('combobox', { name: 'Exam To Invite To' });
    expect(combobox).not.toHaveTextContent('Backend Round');
    expect(combobox).not.toHaveTextContent('Frontend Round');
    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeDisabled();

    // Simulate the recruiter making an explicit choice.
    await userEvent.click(screen.getByRole('combobox', { name: 'Exam To Invite To' }));
    await userEvent.click(screen.getByRole('option', { name: 'Frontend Round' }));

    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Send invitations' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/exams/exam-2/invitations') && call[1]?.method === 'POST')).toBe(true),
    );
  });

  it('shows loading state while candidates are fetching', async () => {
    let resolveCandidates: (value: any) => void;
    const candidatesPromise = new Promise((resolve) => {
      resolveCandidates = resolve;
    });

    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        await candidatesPromise;
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <CandidatesPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument(), { timeout: 2000 });
    resolveCandidates!(null);

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });

  it('shows error state when candidate fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <CandidatesPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load candidates.')).toBeInTheDocument();
  });

  it('sends the typed search text to the server as a query param instead of filtering client-side', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'cand-1', email: 'alice@test.com', name: 'Alice Chen', phone: null, createdAt: '2026-07-01T00:00:00Z', erasedAt: null }],
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
            <CandidatesPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Alice Chen')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search candidates…'), { target: { value: 'alice' } });

    // If page.tsx reverted to filtering an already-fetched array client-side,
    // no request carrying the typed text would ever be made -- this fails in
    // that case, unlike an assertion that only checks the rendered rows.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/candidates') && String(call[0]).includes('search=alice'))).toBe(true),
    );
  });

  describe('managing candidates', () => {
    const NEVER_INVITED = {
      id: 'cand-1',
      email: 'nanji.s@prudentconsulting.com',
      name: 'Nanji',
      phone: null,
      status: 'active',
      createdAt: '2026-07-24T00:00:00.000Z',
      erasedAt: null,
      invitationCount: 0,
    };
    const ALREADY_INVITED = { ...NEVER_INVITED, id: 'cand-2', name: 'Vishwamber Test', email: 'v@example.com', invitationCount: 2 };

    function mockCandidates(candidates: unknown[]) {
      const fetchMock = jest.fn(async (url, options) => {
        if (String(url).endsWith('/auth/refresh')) {
          return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        }
        if (String(url).includes('/candidates/cand-1') && options?.method === 'DELETE') {
          return new Response(JSON.stringify({ id: 'cand-1' }), { status: 200 });
        }
        if (String(url).includes('/candidates/') && options?.method === 'PATCH') {
          return new Response(JSON.stringify({ id: 'cand-1', status: 'inactive' }), { status: 200 });
        }
        if (String(url).includes('/candidates')) {
          return new Response(
            JSON.stringify({ data: candidates, total: candidates.length, page: 1, pageSize: 20, totalPages: 1 }),
            { status: 200 },
          );
        }
        if (String(url).includes('/exams')) {
          return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    function renderPage() {
      render(
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <CandidatesPage />
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>,
      );
    }

    it('requests only active candidates by default, so deactivated ones stay out of the way', async () => {
      const fetchMock = mockCandidates([NEVER_INVITED]);
      renderPage();

      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes('/candidates') && String(call[0]).includes('status=active')),
      ).toBe(true);
    });

    it('drops the status filter entirely when All is selected', async () => {
      const fetchMock = mockCandidates([NEVER_INVITED]);
      renderPage();
      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'All' }));

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some((call) => String(call[0]).includes('/candidates') && !String(call[0]).includes('status=')),
        ).toBe(true),
      );
    });

    it('badges an inactive candidate and offers to reactivate them', async () => {
      mockCandidates([{ ...NEVER_INVITED, status: 'inactive' }]);
      renderPage();

      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    });

    it('deactivates a candidate by patching their status', async () => {
      const fetchMock = mockCandidates([NEVER_INVITED]);
      renderPage();
      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
        expect(patchCall).toBeDefined();
        expect(JSON.parse(String(patchCall![1]?.body))).toEqual({ status: 'inactive' });
      });
      expect(await screen.findByText('Candidate deactivated.')).toBeInTheDocument();
    });

    it('offers Delete only for a candidate who has never been invited', async () => {
      mockCandidates([NEVER_INVITED, ALREADY_INVITED]);
      renderPage();

      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());
      expect(screen.getByText('Vishwamber Test')).toBeInTheDocument();
      // Two candidates on screen but only the never-invited one exposes Delete.
      expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(2);
    });

    it('deletes a candidate after confirming in the dialog', async () => {
      const fetchMock = mockCandidates([NEVER_INVITED]);
      renderPage();
      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(screen.getByText('Delete candidate')).toBeInTheDocument();

      const dialogButtons = screen.getAllByRole('button', { name: 'Delete' });
      await userEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(true));
      expect(await screen.findByText('Candidate deleted.')).toBeInTheDocument();
    });

    it('opens the edit modal prefilled for the chosen candidate', async () => {
      mockCandidates([NEVER_INVITED]);
      renderPage();
      await waitFor(() => expect(screen.getByText('Nanji')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

      // Scoped to the dialog: the page's own "Add candidate" popup has an Email
      // field too when open, so an unscoped query could match both.
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByText('Edit candidate')).toBeInTheDocument();
      expect(dialog.getByLabelText('Email')).toHaveValue('nanji.s@prudentconsulting.com');
      expect(dialog.getByLabelText('First Name')).toHaveValue('Nanji');
      expect(dialog.getByLabelText('Last Name')).toHaveValue('');
    });
  });
});
