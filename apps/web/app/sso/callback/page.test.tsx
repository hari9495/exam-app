import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  YX_SSO_RETURN_KEY: 'yxSsoReturn',
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

  // An enrolled YukthiX factor is still owed after the IdP (P12 YX-IAM-01).
  it('asks for the second factor when the exchange returns a challenge, then signs in', async () => {
    window.sessionStorage.setItem('ssoPendingOrganizationSlug', 'acme');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    const accessToken = fakeJwt({ sub: 'u1', role: 'org_admin' });
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['totp', 'recovery_code'] })
      .mockResolvedValueOnce({ accessToken });

    render(<SsoCallbackPage />);
    await userEvent.type(await screen.findByLabelText('Code from your authenticator app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/users'));
    expect(apiFetch).toHaveBeenLastCalledWith('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ mfaToken: 'pending', factor: 'totp', code: '123456' }) });
    expect(login).toHaveBeenCalledWith('acme', accessToken);
  });

  it('sends an account that must enrol MFA to set it up', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken: fakeJwt({ role: 'org_admin' }), mfa: { required: true, enrolmentDueAt: '2026-10-20T00:00:00Z' } });
    render(<SsoCallbackPage />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile?mfa=setup'));
  });

  // Started from /yx/sign-in: the second step and enrolment are the YukthiX screens.
  it('finishes a YukthiX sign-in in the YukthiX second-step screen', async () => {
    window.sessionStorage.setItem('yxSsoReturn', '1');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    const accessToken = fakeJwt({ sub: 'u1', role: 'org_admin' });
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['totp'] })
      .mockResolvedValueOnce({ accessToken });

    render(<SsoCallbackPage />);
    expect(await screen.findByRole('heading', { name: "Confirm it's you" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('yxSsoReturn')).toBeNull();
    await userEvent.type(screen.getByLabelText(/6-digit code from your authenticator app/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/users'));
  });

  it('sends a YukthiX sign-in that must enrol to the YukthiX set-up page', async () => {
    window.sessionStorage.setItem('yxSsoReturn', '1');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('code=abc123'));
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken: fakeJwt({ role: 'org_admin' }), mfa: { required: true, enrolmentDueAt: '2026-10-20T00:00:00Z' } });
    render(<SsoCallbackPage />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/setup-mfa'));
  });
});
