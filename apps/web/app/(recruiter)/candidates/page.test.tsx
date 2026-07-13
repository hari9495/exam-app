import { render, screen, waitFor } from '@testing-library/react';
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
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'published', sections: [] }]), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify([{ id: 'cand-1', email: 'priya@example.com', name: 'Priya Shah', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }]),
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
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(
          JSON.stringify([
            { id: 'exam-1', title: 'Backend Round', status: 'published', sections: [] },
            { id: 'exam-2', title: 'Frontend Round', status: 'published', sections: [] },
          ]),
          { status: 200 },
        );
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify([{ id: 'cand-1', email: 'priya@example.com', name: 'Priya Shah', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null }]),
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
    const combobox = screen.getByRole('combobox', { name: 'Exam to invite to' });
    expect(combobox).not.toHaveTextContent('Backend Round');
    expect(combobox).not.toHaveTextContent('Frontend Round');
    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeDisabled();

    // Simulate the recruiter making an explicit choice.
    await userEvent.click(screen.getByRole('combobox', { name: 'Exam to invite to' }));
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
        return new Response(JSON.stringify([]), { status: 200 });
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
});
