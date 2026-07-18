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
        return Promise.resolve({ smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null });
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
          body: JSON.stringify({ host: 'smtp.customer.test', port: 587, user: 'customer-user', password: 'customer-pass', fromAddress: '' }),
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
});
