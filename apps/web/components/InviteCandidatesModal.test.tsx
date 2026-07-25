import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteCandidatesModal } from './InviteCandidatesModal';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';

describe('InviteCandidatesModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function renderModal(props: Partial<React.ComponentProps<typeof InviteCandidatesModal>> = {}) {
    return render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <InviteCandidatesModal examId="exam-1" open onClose={() => {}} existingCandidateIds={[]} {...props} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );
  }

  it('lets the recruiter select candidates and sends invitations via the bulk-invite endpoint', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/invitations') && options?.method === 'POST') {
        return new Response(JSON.stringify({ created: [{ id: 'inv-1' }], skipped: [] }), { status: 201 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'cand-1', name: 'Alice', email: 'alice@example.com', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }],
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

    renderModal();

    await waitFor(() => expect(screen.getByText('Alice (alice@example.com)')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /Alice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitations' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/exams/exam-1/invitations') && call[1]?.method === 'POST'),
      ).toBe(true),
    );
    expect(screen.getByText('Invited 1 candidate(s).')).toBeInTheDocument();
  });

  it('asks the server for active candidates only, so deactivated ones cannot be invited', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal();

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes('/candidates') && String(call[0]).includes('status=active')),
      ).toBe(true),
    );
  });

  it('excludes candidates already invited to this exam from the picker', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'cand-1', name: 'Alice', email: 'alice@example.com', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null },
              { id: 'cand-2', name: 'Bob', email: 'bob@example.com', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null },
            ],
            total: 2,
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

    renderModal({ existingCandidateIds: ['cand-1'] });

    await waitFor(() => expect(screen.getByText('Bob (bob@example.com)')).toBeInTheDocument());
    expect(screen.queryByText('Alice (alice@example.com)')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no candidates left to invite', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal();

    await waitFor(() => expect(screen.getByText('No candidates available to invite.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeDisabled();
  });

  it('shows an error toast when sending invitations fails', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/invitations') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Exam is not published' }), { status: 400 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'cand-1', name: 'Alice', email: 'alice@example.com', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }],
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

    renderModal();

    await waitFor(() => expect(screen.getByText('Alice (alice@example.com)')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /Alice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitations' }));

    expect(await screen.findByText('Exam is not published')).toBeInTheDocument();
  });
});
