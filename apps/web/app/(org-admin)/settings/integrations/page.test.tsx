import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntegrationsSettingsPage from './page';
import { ToastProvider } from '../../../../components/ui';
import * as authContext from '../../../../lib/auth-context';
import * as apiClient from '../../../../lib/api-client';

jest.mock('../../../../lib/auth-context');
jest.mock('../../../../lib/api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <IntegrationsSettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('IntegrationsSettingsPage', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/organizations/integrations') {
        return Promise.resolve({
          smtpConfigured: false,
          aiKeyConfigured: false,
          smtpHost: null,
          smtpPort: null,
          emailFromAddress: null,
          apiKeyConfigured: false,
          apiKeyPrefix: null,
          apiKeyCreatedAt: null,
          webhookConfigured: false,
          webhookUrl: null,
        });
      }
      if (path === '/organizations/integrations/webhook-deliveries') {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
  });

  it('shows both integrations as not configured initially', async () => {
    renderPage();
    expect(await screen.findAllByText(/not configured/i)).toHaveLength(2);
  });

  it('submits SMTP settings and shows a success toast on save', async () => {
    renderPage();
    await screen.findByLabelText('SMTP host');

    fireEvent.change(screen.getByLabelText('SMTP host'), { target: { value: 'smtp.customer.test' } });
    fireEvent.change(screen.getByLabelText('SMTP port'), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText('SMTP username'), { target: { value: 'customer-user' } });
    fireEvent.change(screen.getByLabelText('SMTP password'), { target: { value: 'customer-pass' } });

    mockedApiFetch.mockResolvedValueOnce({ smtpConfigured: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save SMTP settings' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/organizations/integrations/smtp',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ host: 'smtp.customer.test', port: 587, user: 'customer-user', password: 'customer-pass' }),
        }),
        'token',
      ),
    );
    const [, options] = mockedApiFetch.mock.calls.find(([path]) => path === '/organizations/integrations/smtp')!;
    expect('fromAddress' in JSON.parse(options.body as string)).toBe(false);
  });

  it('includes fromAddress in the request body when the admin provides one', async () => {
    renderPage();
    await screen.findByLabelText('SMTP host');

    fireEvent.change(screen.getByLabelText('SMTP host'), { target: { value: 'smtp.customer.test' } });
    fireEvent.change(screen.getByLabelText('SMTP port'), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText('SMTP username'), { target: { value: 'customer-user' } });
    fireEvent.change(screen.getByLabelText('SMTP password'), { target: { value: 'customer-pass' } });
    fireEvent.change(screen.getByLabelText('From address (optional)'), { target: { value: 'noreply@customer.test' } });

    mockedApiFetch.mockResolvedValueOnce({ smtpConfigured: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save SMTP settings' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/organizations/integrations/smtp',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            host: 'smtp.customer.test',
            port: 587,
            user: 'customer-user',
            password: 'customer-pass',
            fromAddress: 'noreply@customer.test',
          }),
        }),
        'token',
      ),
    );
  });

  it('shows an inline error when saving the AI key fails validation', async () => {
    renderPage();
    await screen.findByLabelText('AI API key');

    fireEvent.change(screen.getByLabelText('AI API key'), { target: { value: 'sk-ant-bad-key' } });
    mockedApiFetch.mockRejectedValueOnce(new Error('That API key was rejected by Anthropic: authentication_error'));
    fireEvent.click(screen.getByRole('button', { name: 'Save AI API key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That API key was rejected by Anthropic: authentication_error');
  });

  it('shows "No API key generated" when none exists, and a Generate button', async () => {
    renderPage();
    expect(await screen.findByText('No API key generated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });

  it('reveals the full API key once, immediately after generating', async () => {
    mockedApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/organizations/integrations') {
        return Promise.resolve({
          smtpConfigured: false,
          aiKeyConfigured: false,
          smtpHost: null,
          smtpPort: null,
          emailFromAddress: null,
          apiKeyConfigured: false,
          apiKeyPrefix: null,
          apiKeyCreatedAt: null,
          webhookConfigured: false,
          webhookUrl: null,
        });
      }
      if (path === '/organizations/integrations/webhook-deliveries') {
        return Promise.resolve([]);
      }
      if (path === '/organizations/integrations/api-key' && options?.method === 'POST') {
        return Promise.resolve({ apiKey: 'pk_live_abcdef', apiKeyPrefix: 'pk_live_abcd' });
      }
      return Promise.resolve({});
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('pk_live_abcdef')).toBeInTheDocument();
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();
  });

  it('shows the delivery log with event type, status, and HTTP code', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/organizations/integrations') {
        return Promise.resolve({
          smtpConfigured: false,
          aiKeyConfigured: false,
          smtpHost: null,
          smtpPort: null,
          emailFromAddress: null,
          apiKeyConfigured: true,
          apiKeyPrefix: 'pk_live_abcd',
          apiKeyCreatedAt: '2026-07-19T00:00:00.000Z',
          webhookConfigured: true,
          webhookUrl: 'https://example.com/hook',
        });
      }
      if (path === '/organizations/integrations/webhook-deliveries') {
        return Promise.resolve([
          { id: 'delivery-1', eventType: 'invitation.created', status: 'delivered', httpStatusCode: 200, createdAt: '2026-07-19T00:00:00.000Z' },
        ]);
      }
      return Promise.resolve({});
    });

    renderPage();

    expect(await screen.findByText('invitation.created')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });
});
