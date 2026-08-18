import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfferTemplatePage from './page';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

let mockRole = 'recruiter';
jest.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: mockRole }),
}));

const TEMPLATE = {
  id: null,
  subject: 'Your offer from {{orgName}}',
  body: 'Hi {{candidateName}}, we are excited to offer you {{jobTitle}}.',
};

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <OfferTemplatePage />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/offer-template') && (!options?.method || options.method === 'GET')) {
      return new Response(JSON.stringify(TEMPLATE), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('OfferTemplatePage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockRole = 'recruiter';
  });

  it('renders the subject and body loaded from useOfferTemplate', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByLabelText('Subject')).toHaveValue(TEMPLATE.subject);
    expect(screen.getByLabelText('Body')).toHaveValue(TEMPLATE.body);
  });

  it('editing and saving calls the PUT /offer-template mutation', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/offer-template') && options?.method === 'PUT'
        ? new Response(JSON.stringify({ ...TEMPLATE, subject: 'Updated subject' }), { status: 200 })
        : null,
    );
    renderPage();

    const subjectField = await screen.findByLabelText('Subject');
    await userEvent.clear(subjectField);
    await userEvent.type(subjectField, 'Updated subject');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/offer-template') && c[1]?.method === 'PUT');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toMatchObject({ subject: 'Updated subject' });
    });
  });

  it('inserting a merge token appends it to the body', async () => {
    mockFetch();
    renderPage();

    await screen.findByLabelText('Subject');
    await userEvent.click(screen.getByRole('button', { name: '{{offerLink}}' }));

    expect(screen.getByLabelText('Body')).toHaveValue(`${TEMPLATE.body}{{offerLink}}`);
  });

  it('shows an access-denied message for a panel role', async () => {
    mockRole = 'panel';
    mockFetch();
    renderPage();

    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
  });
});
