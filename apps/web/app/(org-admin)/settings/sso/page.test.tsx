import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SsoSettingsPage from './page';
import { apiFetch } from '../../../../lib/api-client';

jest.mock('../../../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'acme' }) }));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('SsoSettingsPage', () => {
  it('shows "Not configured" when SSO is not set up', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ samlEnabled: false, samlIdpEntityId: null, samlIdpSsoUrl: null, samlIdpCertificate: null });

    renderWithClient(<SsoSettingsPage />);

    expect(await screen.findByText(/not configured/i)).toBeInTheDocument();
  });

  it('shows the SP metadata URL for the org-admin to hand to their IdP', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ samlEnabled: false, samlIdpEntityId: null, samlIdpSsoUrl: null, samlIdpCertificate: null });

    renderWithClient(<SsoSettingsPage />);

    expect(await screen.findByText(/\/auth\/saml\/acme\/metadata/)).toBeInTheDocument();
  });

  it('saves the three IdP fields and shows a success state', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({ samlEnabled: false, samlIdpEntityId: null, samlIdpSsoUrl: null, samlIdpCertificate: null })
      .mockResolvedValueOnce({ samlEnabled: false, samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: 'https://idp.test/sso', samlIdpCertificate: 'cert-data' });

    renderWithClient(<SsoSettingsPage />);
    await screen.findByText(/not configured/i);

    await userEvent.type(screen.getByLabelText(/microsoft entra identifier/i), 'https://idp.test/entity');
    await userEvent.type(screen.getByLabelText(/sso url/i), 'https://idp.test/sso');
    await userEvent.type(screen.getByLabelText(/idp certificate/i), 'cert-data');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(apiFetch).toHaveBeenCalledWith(
      '/organizations/sso',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: 'https://idp.test/sso', samlIdpCertificate: 'cert-data' }),
      }),
      'test-token',
    );
  });

  it('shows configured IdP settings read-only behind an Edit button, and Cancel restores the read-only view', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      samlEnabled: true,
      samlIdpEntityId: 'https://idp.test/entity',
      samlIdpSsoUrl: 'https://idp.test/sso',
      samlIdpCertificate: 'cert-data',
    });

    renderWithClient(<SsoSettingsPage />);

    // Values render as text, the certificate only as "Provided" (never its contents),
    // and no editable fields exist until Edit is clicked.
    expect(await screen.findByText('https://idp.test/entity')).toBeInTheDocument();
    expect(screen.getByText('https://idp.test/sso')).toBeInTheDocument();
    expect(screen.getByText('Provided')).toBeInTheDocument();
    expect(screen.queryByLabelText(/microsoft entra identifier/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit IdP settings' }));
    expect(screen.getByLabelText(/microsoft entra identifier/i)).toHaveValue('https://idp.test/entity');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/microsoft entra identifier/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit IdP settings' })).toBeInTheDocument();
  });
});
