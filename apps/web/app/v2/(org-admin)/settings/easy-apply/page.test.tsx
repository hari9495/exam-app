import { render, screen, fireEvent } from '@testing-library/react';
import { useEasyApplyConfig, usePutEasyApplyConfig } from '../../../../../lib/hooks/useEasyApply';
import V2EasyApplySettingsPage from './page';

jest.mock('../../../../../lib/hooks/useEasyApply', () => ({
  useEasyApplyConfig: jest.fn(),
  usePutEasyApplyConfig: jest.fn(),
}));

describe('V2EasyApplySettingsPage', () => {
  const putMutate = jest.fn();

  beforeEach(() => {
    putMutate.mockClear();
    (usePutEasyApplyConfig as jest.Mock).mockReturnValue({ mutate: putMutate, isPending: false });
    (useEasyApplyConfig as jest.Mock).mockReturnValue({
      data: {
        providers: [
          { id: 'indeed', label: 'Indeed Apply', configured: true, ingestUrl: 'https://api.test/api/v1/public/easy-apply/acme/indeed' },
          { id: 'linkedin', label: 'LinkedIn Easy Apply', configured: false, ingestUrl: 'https://api.test/api/v1/public/easy-apply/acme/linkedin' },
        ],
      },
    });
  });

  it('renders each provider with its status chip and ingestion URL', () => {
    render(<V2EasyApplySettingsPage />);
    expect(screen.getByText('Indeed Apply')).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText('https://api.test/api/v1/public/easy-apply/acme/indeed')).toBeInTheDocument();
  });

  it('Enable is disabled for an unconfigured provider until a secret is typed', () => {
    render(<V2EasyApplySettingsPage />);
    const enable = screen.getByRole('button', { name: 'Enable' });
    expect(enable).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Shared secret/, { selector: '#secret-linkedin' }), { target: { value: 's3cret' } });
    expect(screen.getByRole('button', { name: 'Enable' })).toBeEnabled();
  });

  it('Update secret sends the new secret for a configured provider', () => {
    render(<V2EasyApplySettingsPage />);
    fireEvent.change(screen.getByLabelText(/Shared secret/, { selector: '#secret-indeed' }), { target: { value: 'rotated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update secret' }));
    expect(putMutate).toHaveBeenCalledWith({ provider: 'indeed', secret: 'rotated' }, expect.anything());
  });

  it('Disable turns a configured provider off', () => {
    render(<V2EasyApplySettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(putMutate).toHaveBeenCalledWith({ provider: 'indeed', enabled: false }, expect.anything());
  });
});
