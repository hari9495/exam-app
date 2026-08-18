import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageTemplatesPage from './page';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

let mockRole = 'recruiter';
jest.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: mockRole }),
}));

const TEMPLATES = [
  {
    id: null,
    name: 'Application received',
    triggerEvent: 'applied',
    triggerMode: 'manual',
    subject: 'We received your application for {{jobTitle}}',
    body: 'Hi {{candidateName}}, thanks for applying.',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'tmpl-1',
    name: 'Moving to interview (custom)',
    triggerEvent: 'interview',
    triggerMode: 'prompt',
    subject: 'Next steps for {{jobTitle}}',
    body: 'Hi {{candidateName}}, moving you forward.',
    enabled: true,
    isDefault: false,
  },
];

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <MessageTemplatesPage />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(
  overrides: (url: string, options?: RequestInit) => Response | null = () => null,
  integrations: object = { smtpConfigured: true },
) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/candidate-email-templates')) {
      return new Response(JSON.stringify(TEMPLATES), { status: 200 });
    }
    if (urlStr.endsWith('/organizations/integrations')) {
      return new Response(JSON.stringify(integrations), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('MessageTemplatesPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockRole = 'recruiter';
  });

  it('renders both default and saved templates', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByText('Application received')).toBeInTheDocument();
    expect(screen.getByText('Moving to interview (custom)')).toBeInTheDocument();
  });

  it('editing subject/body and saving calls the upsert mutation', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/candidate-email-templates/tmpl-1') && options?.method === 'PATCH'
        ? new Response(JSON.stringify({ ...TEMPLATES[1], subject: 'Updated subject' }), { status: 200 })
        : null,
    );
    renderPage();
    await screen.findByText('Moving to interview (custom)');

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    const subjectField = screen.getByLabelText('Subject');
    await userEvent.clear(subjectField);
    await userEvent.type(subjectField, 'Updated subject');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => String(c[0]).endsWith('/candidate-email-templates/tmpl-1') && c[1]?.method === 'PATCH',
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toMatchObject({ subject: 'Updated subject' });
    });
  });

  it('toggling enabled calls the setEnabled mutation', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/candidate-email-templates/tmpl-1/enabled') && options?.method === 'PATCH'
        ? new Response(JSON.stringify({ ...TEMPLATES[1], enabled: false }), { status: 200 })
        : null,
    );
    renderPage();
    await screen.findByText('Moving to interview (custom)');

    await userEvent.click(screen.getByLabelText('Enabled for Moving to interview (custom)'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => String(c[0]).endsWith('/candidate-email-templates/tmpl-1/enabled') && c[1]?.method === 'PATCH',
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toEqual({ enabled: false });
    });
  });

  it('restore-default on a saved row calls delete', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/candidate-email-templates/tmpl-1') && options?.method === 'DELETE'
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : null,
    );
    renderPage();
    await screen.findByText('Moving to interview (custom)');

    expect(screen.queryByRole('button', { name: 'Restore default' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore default' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => String(c[0]).endsWith('/candidate-email-templates/tmpl-1') && c[1]?.method === 'DELETE',
      );
      expect(call).toBeDefined();
    });
  });

  it('shows a no-SMTP banner when integrations reports smtpConfigured: false', async () => {
    mockFetch(() => null, { smtpConfigured: false });
    renderPage();

    await screen.findByText('Application received');
    expect(await screen.findByText(/Candidate emails won't send until SMTP is configured/)).toBeInTheDocument();
  });

  it('shows no banner when the integrations query errors (e.g. 403 for a non-admin recruiter)', async () => {
    mockFetch((url) => (url.endsWith('/organizations/integrations') ? new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }) : null));
    renderPage();

    await screen.findByText('Application received');
    expect(screen.queryByText(/Candidate emails won't send until SMTP is configured/)).not.toBeInTheDocument();
  });

  it('shows no banner when SMTP is configured', async () => {
    mockFetch();
    renderPage();

    await screen.findByText('Application received');
    expect(screen.queryByText(/Candidate emails won't send until SMTP is configured/)).not.toBeInTheDocument();
  });
});
