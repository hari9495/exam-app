import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
          aiProvider: 'anthropic',
          aiBaseUrl: null,
          aiModelFast: null,
          aiModelStandard: null,
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
    await screen.findByLabelText('SMTP Host');

    fireEvent.change(screen.getByLabelText('SMTP Host'), { target: { value: 'smtp.customer.test' } });
    fireEvent.change(screen.getByLabelText('SMTP Port'), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText('SMTP Username'), { target: { value: 'customer-user' } });
    fireEvent.change(screen.getByLabelText('SMTP Password'), { target: { value: 'customer-pass' } });

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
    await screen.findByLabelText('SMTP Host');

    fireEvent.change(screen.getByLabelText('SMTP Host'), { target: { value: 'smtp.customer.test' } });
    fireEvent.change(screen.getByLabelText('SMTP Port'), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText('SMTP Username'), { target: { value: 'customer-user' } });
    fireEvent.change(screen.getByLabelText('SMTP Password'), { target: { value: 'customer-pass' } });
    fireEvent.change(screen.getByLabelText('From Address (Optional)'), { target: { value: 'noreply@customer.test' } });

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
    await screen.findByLabelText('AI API Key');

    fireEvent.change(screen.getByLabelText('AI API Key'), { target: { value: 'sk-ant-bad-key' } });
    mockedApiFetch.mockRejectedValueOnce(new Error('That API key was rejected: authentication_error'));
    fireEvent.click(screen.getByRole('button', { name: 'Save AI API key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That API key was rejected: authentication_error');
  });

  it('shows only the API key field for the Anthropic provider by default', async () => {
    renderPage();
    await screen.findByLabelText('AI API Key');

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fast-tier Model/deployment Name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Standard-tier Model/deployment Name')).not.toBeInTheDocument();
  });

  it('shows base URL and model fields when OpenAI-compatible is selected, and submits them together', async () => {
    renderPage();
    await screen.findByLabelText('AI Provider');

    await userEvent.click(screen.getByLabelText('AI Provider'));
    await userEvent.click(await screen.findByRole('option', { name: 'OpenAI-compatible' }));

    expect(await screen.findByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Fast-tier Model/deployment Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Standard-tier Model/deployment Name')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('AI API Key'), { target: { value: 'azure-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://example.openai.azure.com/openai/v1' } });
    fireEvent.change(screen.getByLabelText('Fast-tier Model/deployment Name'), { target: { value: 'gpt-fast' } });
    fireEvent.change(screen.getByLabelText('Standard-tier Model/deployment Name'), { target: { value: 'gpt-standard' } });
    mockedApiFetch.mockResolvedValueOnce({ aiKeyConfigured: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save AI API key' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/organizations/integrations/ai-key',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            provider: 'openai-compatible',
            apiKey: 'azure-key',
            baseUrl: 'https://example.openai.azure.com/openai/v1',
            modelFast: 'gpt-fast',
            modelStandard: 'gpt-standard',
          }),
        }),
        'token',
      ),
    );
  });

  it('seeds the provider selector from the fetched integrations, showing the Azure fields for openai-compatible orgs', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/organizations/integrations') {
        return Promise.resolve({
          smtpConfigured: false,
          aiKeyConfigured: true,
          aiProvider: 'openai-compatible',
          aiBaseUrl: 'https://example.openai.azure.com/openai/v1',
          aiModelFast: 'gpt-fast',
          aiModelStandard: 'gpt-standard',
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

    renderPage();

    // Configured section opens read-only: endpoint details are text, not fields,
    // until the admin explicitly clicks Edit.
    expect(await screen.findByText('https://example.openai.azure.com/openai/v1')).toBeInTheDocument();
    expect(screen.getByText('gpt-fast')).toBeInTheDocument();
    expect(screen.getByText('gpt-standard')).toBeInTheDocument();
    expect(screen.queryByLabelText('AI API Key')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit AI settings' }));

    expect(await screen.findByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Fast-tier Model/deployment Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Standard-tier Model/deployment Name')).toBeInTheDocument();
    expect(screen.getByLabelText('AI Provider')).toHaveTextContent('OpenAI-compatible');
  });

  it('hides the SMTP form behind an Edit button once configured, and Cancel restores the read-only view', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/organizations/integrations') {
        return Promise.resolve({
          smtpConfigured: true,
          aiKeyConfigured: false,
          aiProvider: 'anthropic',
          aiBaseUrl: null,
          aiModelFast: null,
          aiModelStandard: null,
          smtpHost: 'smtp.office365.com',
          smtpPort: 587,
          emailFromAddress: 'noreply@example.com',
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

    renderPage();

    expect(await screen.findByText(/Configured — smtp\.office365\.com:587/)).toBeInTheDocument();
    expect(screen.queryByLabelText('SMTP Host')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit SMTP settings' }));
    expect(screen.getByLabelText('SMTP Host')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('SMTP Host')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit SMTP settings' })).toBeInTheDocument();
  });

  it('shows an inline error when generating the API key fails', async () => {
    renderPage();
    await screen.findByText('No API key generated');

    mockedApiFetch.mockRejectedValueOnce(new Error('Failed to reach the server'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to reach the server');
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
          aiProvider: 'anthropic',
          aiBaseUrl: null,
          aiModelFast: null,
          aiModelStandard: null,
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
          aiProvider: 'anthropic',
          aiBaseUrl: null,
          aiModelFast: null,
          aiModelStandard: null,
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
