import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataRightsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const CANDIDATE = { id: 'cand-1', email: 'gina@example.com', name: 'Gina GDPR', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null };
const EXPORT_DATA = {
  candidate: { id: 'cand-1', email: 'gina@example.com', name: 'Gina GDPR', phone: null, createdAt: '2026-01-01T00:00:00.000Z' },
  invitations: [{ id: 'inv-1', examTitle: 'Backend Round', status: 'invited', invitedAt: '2026-01-02T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z', revokedAt: null }],
  attempts: [],
};

describe('DataRightsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('looks up, exports, and erases a candidate', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/export')) {
        return new Response(JSON.stringify(EXPORT_DATA), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/erase') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'cand-1', erasedAt: '2026-07-14T12:00:00.000Z' }), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <DataRightsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText('Candidate email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(screen.getByText('Backend Round — invited')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));

    await waitFor(() => expect(screen.getByText(/Erased at/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Erase candidate' })).not.toBeInTheDocument();
  });

  it('shows an error when no candidate matches the email', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates/lookup')) {
        return new Response(JSON.stringify({ message: 'No candidate found with email nobody@nowhere.test' }), { status: 404 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <DataRightsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText('Candidate email'), 'nobody@nowhere.test');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
