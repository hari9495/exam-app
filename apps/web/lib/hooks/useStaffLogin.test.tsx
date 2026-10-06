import { act, renderHook, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { fakeJwt } from '../test-utils/fake-jwt';
import { roleToLandingPath } from '../staff-routing';
import { useStaffLogin } from './useStaffLogin';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../auth-context', () => ({ useAuth: jest.fn(), SSO_PENDING_SLUG_KEY: 'k' }));
jest.mock('./useBranding', () => ({ useBranding: () => ({ data: undefined }) }));
jest.mock('./useDocumentBranding', () => ({ useDocumentBranding: () => undefined }));

// Staff sign-in with the second factor (P12 YX-IAM-01/03).
describe('useStaffLogin', () => {
  const push = jest.fn();
  const login = jest.fn();
  const api = apiFetch as jest.Mock;
  const submitEvent = { preventDefault: () => undefined } as React.FormEvent;

  beforeEach(() => {
    push.mockClear();
    login.mockClear();
    api.mockReset();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAuth as jest.Mock).mockReturnValue({ login });
  });

  async function submitPassword() {
    const hook = renderHook(() => useStaffLogin());
    act(() => {
      hook.result.current.setOrganizationSlug('acme');
      hook.result.current.setEmail('a@acme.test');
      hook.result.current.setPassword('Corr3ct-Horse-Battery');
    });
    await act(() => hook.result.current.handleSubmit(submitEvent));
    return hook;
  }

  it('a password for an account with a factor yields the second step, not a session', async () => {
    api.mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['passkey', 'recovery_code'] });
    const hook = await submitPassword();
    expect(hook.result.current.challenge).toEqual({ mfaRequired: true, mfaToken: 'pending', factors: ['passkey', 'recovery_code'] });
    expect(login).not.toHaveBeenCalled();

    api.mockResolvedValueOnce({ challenge: 'c' });
    await expect(hook.result.current.secondFactorPasskeyOptions()).resolves.toEqual({ challenge: 'c' });
    expect(api).toHaveBeenLastCalledWith('/auth/mfa/passkey-options', { method: 'POST', body: JSON.stringify({ mfaToken: 'pending' }) });

    const accessToken = fakeJwt({ role: 'recruiter' });
    api.mockResolvedValueOnce({ accessToken });
    await act(() => hook.result.current.verifySecondFactor({ factor: 'passkey', credential: { id: 'c1' } }));
    expect(api).toHaveBeenLastCalledWith('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: 'pending', factor: 'passkey', credential: { id: 'c1' } }),
    });
    expect(login).toHaveBeenCalledWith('acme', accessToken);
    expect(push).toHaveBeenCalledWith(roleToLandingPath('recruiter'));
  });

  it('starting again clears the challenge and the password', async () => {
    api.mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['totp'] });
    const hook = await submitPassword();
    act(() => hook.result.current.cancelChallenge());
    expect(hook.result.current.challenge).toBeNull();
    expect(hook.result.current.password).toBe('');
  });

  it('an account that must enrol is sent to set up two-step verification', async () => {
    api.mockResolvedValueOnce({ accessToken: fakeJwt({ role: 'org_admin' }), mfa: { required: true, enrolmentDueAt: '2026-10-20T00:00:00Z' } });
    await submitPassword();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile?mfa=setup'));
  });
});
