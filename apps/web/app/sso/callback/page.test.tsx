import { render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import SsoCallbackPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../../lib/auth-context', () => ({
  useAuth: jest.fn(),
  SSO_PENDING_SLUG_KEY: 'ssoPendingOrganizationSlug',
}));

describe('SsoCallbackPage', () => {
  const push = jest.fn();
  const login = jest.fn();

  beforeEach(() => {
    push.mockClear();
    login.mockClear();
    (apiFetch as jest.Mock).mockReset();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAuth as jest.Mock).mockReturnValue({ login });
    window.sessionStorage.clear();
  });

  it('exchanges a code for tokens, logs the session in via useAuth().login with the stashed org slug, and redirects by role', async () => {
    window.sessionStorage.setItem('ssoPendingOrganizationSlug', 'acme');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    const accessToken = fakeJwt({ sub: 'u1', role: 'recruiter' });
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken });

    render(<SsoCallbackPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(apiFetch).toHaveBeenCalledWith('/auth/sso/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: 'abc123' }),
    });
    expect(login).toHaveBeenCalledWith('acme', accessToken);
    expect(window.sessionStorage.getItem('ssoPendingOrganizationSlug')).toBeNull();
  });

  it('logs in with an empty slug when no slug was stashed (e.g. direct navigation)', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    const accessToken = fakeJwt({ sub: 'u1', role: 'recruiter' });
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken });

    render(<SsoCallbackPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(login).toHaveBeenCalledWith('', accessToken);
  });

  it('redirects org_admin to /users', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken: fakeJwt({ role: 'org_admin' }) });

    render(<SsoCallbackPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/users'));
  });

  it('redirects panel to /reports', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken: fakeJwt({ role: 'panel' }) });

    render(<SsoCallbackPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/reports'));
  });

  it('shows a not-authorized message and a link back to password login for ssoError=not_provisioned', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('ssoError=not_provisioned'));

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/not.*authorized|contact your org admin/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to login|password/i })).toHaveAttribute('href', '/login');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows a generic sign-in-failed message for other ssoError values', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('ssoError=invalid_response'));

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows an error when the code exchange itself fails', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=expired-code'));
    (apiFetch as jest.Mock).mockRejectedValue(new Error('This sign-in link is invalid or has expired'));

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/expired|invalid|sign-in failed/i)).toBeInTheDocument();
  });

  it('shows an error when there is neither a code nor an ssoError in the URL', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('auto-redirects to /login a few seconds after showing an error', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('ssoError=invalid_response'));

    render(<SsoCallbackPage />);

    await screen.findByText(/sign-in failed/i);
    expect(push).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    expect(push).toHaveBeenCalledWith('/login');

    jest.useRealTimers();
  });
});
