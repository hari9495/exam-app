import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendMessageModal } from './SendMessageModal';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../ui';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: 'recruiter' }),
}));

const TEMPLATES = [
  {
    id: 't1',
    name: 'Moving to interview',
    triggerEvent: 'interview',
    triggerMode: 'prompt',
    subject: 'Next steps for {{jobTitle}}',
    body: 'Hi {{candidateName}},\n\nWe would like to move you forward for {{jobTitle}} at {{orgName}}.\n\n{{recruiterName}}',
    enabled: true,
    isDefault: false,
  },
  {
    id: null,
    name: 'Application received',
    triggerEvent: 'applied',
    triggerMode: 'manual',
    subject: 'We received your application',
    body: 'Hi {{candidateName}}, thanks for applying.',
    enabled: true,
    isDefault: true,
  },
];

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/candidate-email-templates')) {
      return new Response(JSON.stringify(TEMPLATES), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderModal(onClose = jest.fn()) {
  return render(
    <QueryProvider>
      <ToastProvider>
        <SendMessageModal entryId="entry-1" candidateId="cand-1" candidateName="Alice Applicant" onClose={onClose} />
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('SendMessageModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('picking a template fills the raw subject/body, tokens included', async () => {
    mockFetch();
    renderModal();

    await userEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Moving to interview' }));

    expect(screen.getByLabelText('Subject')).toHaveValue('Next steps for {{jobTitle}}');
    expect(screen.getByLabelText('Body')).toHaveValue(
      'Hi {{candidateName}},\n\nWe would like to move you forward for {{jobTitle}} at {{orgName}}.\n\n{{recruiterName}}',
    );
  });

  it('shows a live preview with tokens replaced by sample values', async () => {
    mockFetch();
    renderModal();

    await userEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Moving to interview' }));

    expect(screen.getByText('Next steps for the role')).toBeInTheDocument();
    // getByText's default normalizer collapses whitespace (incl. the template's blank lines) to
    // single spaces, so this asserts against the normalized form, not the raw \n\n-separated body.
    expect(
      screen.getByText('Hi Alice Applicant, We would like to move you forward for the role at your organization. the recruiting team'),
    ).toBeInTheDocument();
  });

  it('sends the edited subject/body with the picked templateId', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/pipeline/entries/entry-1/messages') && options?.method === 'POST'
        ? new Response(JSON.stringify({ id: 'm1' }), { status: 201 })
        : null,
    );
    const onClose = jest.fn();
    renderModal(onClose);

    await userEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Moving to interview' }));

    const subjectInput = screen.getByLabelText('Subject');
    await userEvent.clear(subjectInput);
    await userEvent.type(subjectInput, 'Edited subject line');

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const postCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/pipeline/entries/entry-1/messages') && call[1]?.method === 'POST',
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall![1]?.body))).toEqual({
      templateId: 't1',
      subject: 'Edited subject line',
      body: 'Hi {{candidateName}},\n\nWe would like to move you forward for {{jobTitle}} at {{orgName}}.\n\n{{recruiterName}}',
    });
  });
});
