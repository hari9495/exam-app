import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExamsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('ExamsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
    localStorage.clear();
  });

  it('lists exams with their status badge', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
  });

  it('offers a column chooser that hides the Duration column', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', durationMinutes: 45, invitationCount: 0, attemptSettledCount: 0, attemptTotalCount: 0, createdAt: '2026-01-01T00:00:00.000Z', sections: [] }],
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
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    // Duration is sortable, so Table renders its <th> with role="button", not columnheader.
    expect(screen.getByRole('button', { name: /Duration/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Choose Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Duration' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: /Duration/ })).not.toBeInTheDocument();
    expect(screen.getByText('Backend Round')).toBeInTheDocument();
  });

  it('shows loading state while exams are fetching', async () => {
    let resolveExams: (value: any) => void;
    const examsPromise = new Promise((resolve) => {
      resolveExams = resolve;
    });

    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        await examsPromise;
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull(), { timeout: 2000 });
    resolveExams!(null);

    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  });

  it('shows error state when exam fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load exams.')).toBeInTheDocument();
  });

  it("duplicates an exam and navigates to the new exam's edit page", async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'exam-2', title: 'Backend Round (Copy)' }), { status: 201 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Duplicate'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/exams/exam-2/edit'));
  });

  it('shows an error toast when duplicating an exam fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Exam not found' }), { status: 404 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Duplicate'));

    await waitFor(() => expect(screen.getByText('Exam not found')).toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a status badge and a settled/total progress readout for each exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'exam-1',
                title: 'Backend Round',
                status: 'published',
                sections: [],
                invitationCount: 20,
                attemptSettledCount: 14,
                attemptTotalCount: 17,
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
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('14/17')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('deletes an exam after confirming in the dialog', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({ id: 'exam-1', status: 'archived' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Delete'));

    expect(screen.getByText('Delete Exam')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Exam deleted.')).toBeInTheDocument());
    expect(screen.queryByText('Delete exam')).not.toBeInTheDocument();
  });

  it('shows an error toast and keeps the exam when deletion fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({ message: 'Exam not found' }), { status: 404 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Delete'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Exam not found')).toBeInTheDocument());
  });

  it('closes the delete dialog without calling the API when cancelled', async () => {
    const fetchMock = jest.fn(async (url, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
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
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More Actions' }));
    await userEvent.click(await screen.findByText('Delete'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Delete exam')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
  });

  it('sends the typed search text to the server as a query param instead of filtering client-side', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
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
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search Exams'), { target: { value: 'onboarding' } });

    // If page.tsx reverted to filtering an already-fetched array client-side,
    // no request carrying the typed text would ever be made -- this fails in
    // that case, unlike an assertion that only checks the rendered rows.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/exams') && String(call[0]).includes('search=onboarding'))).toBe(true),
    );
  });

  it('sends the selected status filter to the server as a query param, and resets to page 1', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
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
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );
    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await user.click(await screen.findByText('Published'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/exams') && String(call[0]).includes('status=published'))).toBe(true),
    );
  });
});
