import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemLogsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const EVENT_API = {
  id: 'evt-1',
  organizationId: 'org-1',
  service: 'api',
  severity: 'error',
  message: 'TypeError: boom',
  context: { status: 500, route: '/api/v1/exams', method: 'POST' },
  occurredAt: '2026-08-03T10:00:00.000Z',
};
const EVENT_BROWSER = {
  id: 'evt-2',
  organizationId: 'org-1',
  service: 'candidate-browser',
  severity: 'warn',
  message: 'answer_save_failed: network error',
  context: { kind: 'answer_save_failed', attemptId: 'attempt-1' },
  occurredAt: '2026-08-03T09:00:00.000Z',
};

function stubFetch(handler: (url: string) => Response | null): typeof fetch {
  return jest.fn(async (url) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
    }
    const result = handler(urlStr);
    if (result) return result;
    return new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 });
  }) as unknown as typeof fetch;
}

function renderPage() {
  return render(
    <QueryProvider>
      <AuthProvider>
        <SystemLogsPage />
      </AuthProvider>
    </QueryProvider>,
  );
}

describe('SystemLogsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists events with service, severity, and message', async () => {
    global.fetch = stubFetch((url) =>
      url.includes('/system-events') ? new Response(JSON.stringify({ data: [EVENT_API, EVENT_BROWSER], total: 2 }), { status: 200 }) : null,
    );
    renderPage();

    expect(await screen.findByText('TypeError: boom')).toBeInTheDocument();
    expect(screen.getByText('answer_save_failed: network error')).toBeInTheDocument();
    expect(screen.getByText('Staff API')).toBeInTheDocument();
    expect(screen.getByText('Candidate browser')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 events')).toBeInTheDocument();
  });

  it('filters by service via the query string', async () => {
    global.fetch = stubFetch((url) => {
      if (url.includes('/system-events') && url.includes('service=candidate-browser')) {
        return new Response(JSON.stringify({ data: [EVENT_BROWSER], total: 1 }), { status: 200 });
      }
      if (url.includes('/system-events')) {
        return new Response(JSON.stringify({ data: [EVENT_API, EVENT_BROWSER], total: 2 }), { status: 200 });
      }
      return null;
    });
    renderPage();
    await screen.findByText('TypeError: boom');

    await userEvent.click(screen.getByRole('button', { name: 'Filter by Service' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Candidate browser' }));

    await waitFor(() => expect(screen.queryByText('TypeError: boom')).not.toBeInTheDocument());
    expect(screen.getByText('answer_save_failed: network error')).toBeInTheDocument();
  });

  it('opens the detail modal with the full context JSON', async () => {
    global.fetch = stubFetch((url) =>
      url.includes('/system-events') ? new Response(JSON.stringify({ data: [EVENT_API], total: 1 }), { status: 200 }) : null,
    );
    renderPage();
    await screen.findByText('TypeError: boom');

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(await screen.findByText(/"route": "\/api\/v1\/exams"/)).toBeInTheDocument();
  });

  it('shows the all-clear empty state when nothing failed', async () => {
    global.fetch = stubFetch(() => null);
    renderPage();

    expect(await screen.findByText(/nothing has failed/i)).toBeInTheDocument();
  });
});
