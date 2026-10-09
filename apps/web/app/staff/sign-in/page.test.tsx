import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import StaffSignInPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/bot-challenge', () => ({ botChallengeToken: async () => null }));
jest.mock('@simplewebauthn/browser', () => ({ startAuthentication: jest.fn() }));

const api = apiFetch as jest.Mock;
const push = jest.fn();
const login = jest.fn();
const token = fakeJwt({ sub: 'staff-1', role: 'super_admin' });

async function signIn(password = 'Staff-Passw0rd-26') {
  await userEvent.type(screen.getByLabelText(/Staff email/), 'ops@yukthix.test');
  await userEvent.type(screen.getByLabelText(/^Password/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('/staff/sign-in', () => {
  beforeEach(() => {
    api.mockReset();
    push.mockReset();
    login.mockReset();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAuth as jest.Mock).mockReturnValue({ login });
    window.history.replaceState(null, '', '/staff/sign-in');
  });

  it('signs in through the platform endpoint, then the security key, and lands on the platform console', async () => {
    api
      .mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['passkey'] })
      .mockResolvedValueOnce({ challenge: 'c' })
      .mockResolvedValueOnce({ accessToken: token });
    (startAuthentication as jest.Mock).mockResolvedValue({ id: 'key-1' });

    render(<StaffSignInPage />);
    expect(screen.queryByLabelText(/Organization/)).toBeNull();
    await signIn();

    expect(api).toHaveBeenNthCalledWith(1, '/auth/platform/login', { method: 'POST', body: JSON.stringify({ email: 'ops@yukthix.test', password: 'Staff-Passw0rd-26' }) });
    expect(await screen.findByRole('heading', { name: "Confirm it's you" })).toBeInTheDocument();
    // Staff hold a security key only: no code or recovery-code choice.
    expect(screen.queryByText(/Authenticator app|Recovery code|Text message/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /passkey|security key/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/organizations'));
    expect(api).toHaveBeenNthCalledWith(2, '/auth/mfa/passkey-options', { method: 'POST', body: JSON.stringify({ mfaToken: 'pending' }) });
    expect(api).toHaveBeenNthCalledWith(3, '/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ mfaToken: 'pending', factor: 'passkey', credential: { id: 'key-1' } }) });
    expect(login).toHaveBeenCalledWith('', token);
  });

  it('returns to a same-site ?next= path, and ignores an off-site one', async () => {
    window.history.replaceState(null, '', '/staff/sign-in?next=/v2/plans');
    api.mockResolvedValueOnce({ accessToken: token });
    const { unmount } = render(<StaffSignInPage />);
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/plans'));
    unmount();

    window.history.replaceState(null, '', '/staff/sign-in?next=//evil.example/x');
    api.mockResolvedValueOnce({ accessToken: token });
    render(<StaffSignInPage />);
    await signIn();
    await waitFor(() => expect(push).toHaveBeenLastCalledWith('/v2/organizations'));
  });

  it('a staff account with no security key yet goes to set one up', async () => {
    api.mockResolvedValueOnce({ accessToken: token, mfa: { required: true, enrolmentDueAt: '2026-10-20T00:00:00Z' } });
    render(<StaffSignInPage />);
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/setup-mfa'));
  });

  it('says a wrong password plainly and stays on the page', async () => {
    api.mockRejectedValueOnce(new Error('Invalid credentials'));
    render(<StaffSignInPage />);
    await signIn('wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password. Try again.');
    expect(push).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });
});
