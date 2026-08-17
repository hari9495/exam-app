import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobsPage from './page';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('../../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org' }) }));

const JOBS = [
  {
    id: 'job-1',
    title: 'Backend Engineer',
    status: 'open',
    createdAt: '2026-08-01T00:00:00.000Z',
    stageCounts: { applied: 4, screened: 0, interview: 2, offer: 1, hired: 0, rejected: 1 },
  },
  {
    id: 'job-2',
    title: 'Frontend Engineer',
    status: 'closed',
    createdAt: '2026-07-01T00:00:00.000Z',
    stageCounts: { applied: 0, screened: 0, interview: 0, offer: 0, hired: 3, rejected: 0 },
  },
];

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <JobsPage />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/jobs')) {
      return new Response(JSON.stringify(JOBS), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('JobsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists jobs with a compact stage-count summary', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();

    expect(screen.getByText('4 applied · 2 interview · 1 offer')).toBeInTheDocument();
    expect(screen.getByText('3 hired')).toBeInTheDocument();
  });

  it('links each job to its detail page', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: 'Backend Engineer' });
    expect(link).toHaveAttribute('href', '/jobs/job-1');
  });

  it('creates a job with the entered title/description', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/jobs') && options?.method === 'POST'
        ? new Response(
            JSON.stringify({
              id: 'job-new',
              title: 'QA Engineer',
              status: 'open',
              createdAt: '2026-08-17T00:00:00.000Z',
              stageCounts: { applied: 0, screened: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
            }),
            { status: 201 },
          )
        : null,
    );
    renderPage();
    await screen.findByText('Backend Engineer');

    await userEvent.type(screen.getByLabelText('Job Title'), 'QA Engineer');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Tests things');
    await userEvent.click(screen.getByRole('button', { name: /create job/i }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/jobs') && call[1]?.method === 'POST');
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall![1]?.body));
      expect(body.title).toBe('QA Engineer');
      expect(body.description).toBe('Tests things');
    });
    expect(await screen.findByText('Job created.')).toBeInTheDocument();
  });
});
