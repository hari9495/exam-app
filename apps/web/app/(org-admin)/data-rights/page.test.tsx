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

    await userEvent.type(screen.getByLabelText('Candidate Email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    expect(screen.getByText('invited')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.type(screen.getByLabelText("Type The Candidate's Email To Confirm"), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));

    await waitFor(() => expect(screen.getByText(/Erased at/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Erase candidate' })).not.toBeInTheDocument();
  });

  it('keeps the Confirm erase button disabled until the typed email matches exactly', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
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

    await userEvent.type(screen.getByLabelText('Candidate Email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirm erase' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Type The Candidate's Email To Confirm"), 'wrong@example.com');
    expect(confirmButton).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("Type The Candidate's Email To Confirm"));
    await userEvent.type(screen.getByLabelText("Type The Candidate's Email To Confirm"), 'gina@example.com');
    expect(confirmButton).toBeEnabled();
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

    await userEvent.type(screen.getByLabelText('Candidate Email'), 'nobody@nowhere.test');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows an error and keeps the modal open when erase fails', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/erase') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Erase failed unexpectedly' }), { status: 500 });
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

    await userEvent.type(screen.getByLabelText('Candidate Email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.type(screen.getByLabelText("Type The Candidate's Email To Confirm"), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));

    // Wait for the error message to appear; it renders in both the modal and top-of-page
    await waitFor(() => expect(screen.getAllByText('Erase failed unexpectedly').length).toBeGreaterThan(0));
    // Modal should remain open, so the Confirm erase button should still be visible
    // This proves the error is visible while the modal is still open
    expect(screen.getByRole('button', { name: 'Confirm erase' })).toBeInTheDocument();
  });

  it('clears the error banner when a failed erase is retried and succeeds', async () => {
    let eraseCallCount = 0;
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/erase') && options?.method === 'POST') {
        eraseCallCount++;
        // First erase attempt fails, second succeeds
        if (eraseCallCount === 1) {
          return new Response(JSON.stringify({ message: 'Erase failed on first attempt' }), { status: 500 });
        }
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

    // Look up the candidate
    await userEvent.type(screen.getByLabelText('Candidate Email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());

    // Open erase modal and click confirm (first time - fails)
    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.type(screen.getByLabelText("Type The Candidate's Email To Confirm"), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));

    // Wait for error banner to appear with the first failure message; it renders in both the modal and top-of-page
    await waitFor(() => expect(screen.getAllByText('Erase failed on first attempt').length).toBeGreaterThan(0));

    // Modal should still be open, click confirm again (second time - succeeds)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));

    // Wait for the success state (erased message appears)
    await waitFor(() => expect(screen.getByText(/Erased at/)).toBeInTheDocument());

    // Verify the error banner is gone (stale banner bug is fixed)
    expect(screen.queryAllByText('Erase failed on first attempt').length).toBe(0);
  });

  it('exports and renders the full attempt record -- answers, proctoring, insight, and messages -- not just a summary row', async () => {
    const richExportData = {
      candidate: { id: 'cand-1', email: 'gina@example.com', name: 'Gina GDPR', phone: null, createdAt: '2026-01-01T00:00:00.000Z' },
      invitations: [
        { id: 'inv-1', examTitle: 'Backend Round', status: 'invited', invitedAt: '2026-01-02T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z', revokedAt: null },
      ],
      attempts: [
        {
          id: 'att-1',
          examTitle: 'Backend Round',
          status: 'submitted',
          startedAt: '2026-01-03T10:00:00.000Z',
          submittedAt: '2026-01-03T11:00:00.000Z',
          deviceFingerprint: 'fp-abc123',
          result: { score: 8, maxScore: 10, percentage: 80, passFail: 'pass' },
          answers: [{ questionText: 'What is 2+2?', selectedOptions: ['4'], isCorrect: true, marksAwarded: 5 }],
          proctoringEvents: [{ eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-03T10:30:00.000Z', metadata: null }],
          proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'No significant concerns.' },
          insight: { status: 'completed', summary: 'Strong performance on core topics.' },
          messages: [{ body: 'Please continue, you are doing fine.', sentAt: '2026-01-03T10:15:00.000Z', readAt: null }],
        },
      ],
    };
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/export')) {
        return new Response(JSON.stringify(richExportData), { status: 200 });
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

    await userEvent.type(screen.getByLabelText('Candidate Email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));

    // Summary fields visible without expanding anything.
    await waitFor(() => expect(screen.getByText('8/10 (80.0%)')).toBeInTheDocument());
    expect(screen.getByText(/No significant concerns/)).toBeInTheDocument();
    expect(screen.getByText(/Strong performance on core topics/)).toBeInTheDocument();
    expect(screen.getByText('Device: fp-abc123')).toBeInTheDocument();

    // The heavier nested detail (answers/proctoring events/messages) sits inside a native
    // <details>, collapsed by default in a real browser -- jsdom doesn't implement that
    // native collapse, so this only checks the summary labels and that the detail content
    // reaches the DOM at all, not the browser's own show/hide behavior.
    expect(screen.getByText('Answers (1)')).toBeInTheDocument();
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();

    expect(screen.getByText('Proctoring events (1)')).toBeInTheDocument();
    expect(screen.getByText(/tab_switch \(medium\)/)).toBeInTheDocument();

    expect(screen.getByText('Messages (1)')).toBeInTheDocument();
    expect(screen.getByText(/Please continue, you are doing fine\./)).toBeInTheDocument();
  });

  it('shows the invitation and attempt counts in the erase confirmation once data has been exported', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/export')) {
        return new Response(
          JSON.stringify({
            ...EXPORT_DATA,
            attempts: [{ id: 'att-1', examTitle: 'Backend Round', status: 'submitted', startedAt: '2026-01-03T10:00:00.000Z', submittedAt: null, deviceFingerprint: null, result: null, answers: [], proctoringEvents: [], proctoringAnalysis: null, insight: null, messages: [] }],
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
            <DataRightsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText('Candidate Email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    // "Backend Round" now appears twice -- once in the Invitations table, once on the
    // attempt card -- so wait on the attempt count heading instead of a single instance.
    await waitFor(() => expect(screen.getByText('Attempts (1)')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    expect(screen.getByText(/across 1 invitation\(s\) and 1 attempt\(s\)/)).toBeInTheDocument();
  });
});
