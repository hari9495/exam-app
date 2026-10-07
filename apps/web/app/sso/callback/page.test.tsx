import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import SsoCallbackPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// The API hands the result over in the URL fragment (never sent to a server or in a Referer).
const atCallback = (fragment: string) => window.history.replaceState(null, '', `/sso/callback${fragment ? `#${fragment}` : ''}`);
jest.mock('../../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../../lib/auth-context', () => ({ useAuth: jest.fn() }));

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

  it('exchanges a code for tokens, signs in and lands an exam admin in their console', async () => {
    atCallback('code=abc123');
    const accessToken = fakeJwt({ sub: 'u1', role: 'org_admin' });
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({ accessToken })
      .mockResolvedValueOnce(['exam:manage'])
      .mockRejectedValueOnce(new Error('You have no employee record in this company.'));

    render(<SsoCallbackPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/users'));
    expect(apiFetch).toHaveBeenCalledWith('/auth/sso/exchange', { method: 'POST', body: JSON.stringify({ code: 'abc123' }) });
    expect(login).toHaveBeenCalledWith('', accessToken);
  });

  it('shows a not-authorized message and a link back to password login for ssoError=not_provisioned', async () => {
    atCallback('ssoError=not_provisioned');

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/not.*authorized|contact your org admin/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/yx/sign-in');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows a generic sign-in-failed message for other ssoError values', async () => {
    atCallback('ssoError=invalid_response');

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows an error when the code exchange itself fails', async () => {
    atCallback('code=expired-code');
    (apiFetch as jest.Mock).mockRejectedValue(new Error('This sign-in link is invalid or has expired'));

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/expired|invalid|sign-in failed/i)).toBeInTheDocument();
  });

  it('reads the code from the fragment only and wipes it from the address bar', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken: fakeJwt({ role: 'recruiter' }) });
    atCallback('code=abc123');

    render(<SsoCallbackPage />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/auth/sso/exchange', { method: 'POST', body: JSON.stringify({ code: 'abc123' }) }));
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('abc123');
  });

  it('ignores a code in the query string (the old, leaky form)', async () => {
    window.history.replaceState(null, '', '/sso/callback?code=abc123');

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows an error when there is neither a code nor an ssoError in the URL', async () => {
    atCallback('');

    render(<SsoCallbackPage />);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('auto-redirects to /yx/sign-in a few seconds after showing an error', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    atCallback('ssoError=invalid_response');

    render(<SsoCallbackPage />);

    await screen.findByText(/sign-in failed/i);
    expect(push).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    expect(push).toHaveBeenCalledWith('/yx/sign-in');

    jest.useRealTimers();
  });

  // An enrolled YukthiX factor is still owed after the IdP (P12 YX-IAM-01).
  it('asks for the second factor in the YukthiX screen, then signs in', async () => {
    atCallback('code=abc123');
    const accessToken = fakeJwt({ sub: 'u1', role: 'org_admin' });
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['totp'] })
      .mockResolvedValueOnce({ accessToken })
      .mockResolvedValueOnce(['exam:manage'])
      .mockRejectedValueOnce(new Error('You have no employee record in this company.'));

    render(<SsoCallbackPage />);
    expect(await screen.findByRole('heading', { name: "Confirm it's you" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Authenticator app' })); // the method cards
    await userEvent.type(screen.getByLabelText(/6-digit code from your authenticator app/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    // An admin with exam permissions keeps the role console.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/users'));
  });

  it('lands a YukthiX SSO sign-in without exam/ATS permissions in YukthiX', async () => {
    atCallback('code=abc123');
    (apiFetch as jest.Mock).mockResolvedValueOnce({ accessToken: fakeJwt({ sub: 'u2', role: 'panel' }) }).mockResolvedValueOnce(['employee.profile.view']).mockRejectedValueOnce(new Error('You have no employee record in this company.'));
    render(<SsoCallbackPage />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/people/directory'));
  });

  it('sends a YukthiX sign-in that must enrol to the YukthiX set-up page', async () => {
    atCallback('code=abc123');
    (apiFetch as jest.Mock).mockResolvedValue({ accessToken: fakeJwt({ role: 'org_admin' }), mfa: { required: true, enrolmentDueAt: '2026-10-20T00:00:00Z' } });
    render(<SsoCallbackPage />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/setup-mfa'));
  });
});
