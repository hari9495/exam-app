import { act, renderHook, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../api-client';
import { goTo } from '../navigate';
import { useAuth } from '../auth-context';
import { fakeJwt } from '../test-utils/fake-jwt';
import { roleToLandingPath } from '../staff-routing';
import { useStaffLogin } from './useStaffLogin';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../navigate', () => ({ goTo: jest.fn() }));
jest.mock('../auth-context', () => ({ useAuth: jest.fn(), SSO_PENDING_SLUG_KEY: 'k', YX_SSO_RETURN_KEY: 'yx' }));
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

  describe('one-time code (P12 §3, M04 Q2)', () => {
    async function sendCode(identifier: string, channel?: 'sms' | 'whatsapp') {
      const hook = renderHook(() => useStaffLogin());
      act(() => {
        hook.result.current.setOrganizationSlug('acme');
        hook.result.current.toggleOtpMode();
        hook.result.current.setIdentifier(identifier);
      });
      api.mockResolvedValueOnce({ otpToken: 't'.repeat(43), expiresInSeconds: 300, resendAfterSeconds: 60 });
      await act(() => hook.result.current.sendOtp(channel));
      return hook;
    }

    it('sends a code, then signs in with it', async () => {
      const hook = await sendCode(' a@acme.test ');
      expect(api).toHaveBeenLastCalledWith('/auth/otp/start', { method: 'POST', body: JSON.stringify({ organizationSlug: 'acme', identifier: 'a@acme.test' }) });
      expect(hook.result.current.otpSent).toEqual({ otpToken: 't'.repeat(43), identifier: 'a@acme.test' });

      act(() => hook.result.current.setOtpCode('123456'));
      const accessToken = fakeJwt({ role: 'panel' });
      api.mockResolvedValueOnce({ accessToken });
      await act(() => hook.result.current.verifyOtp(submitEvent));
      expect(api).toHaveBeenLastCalledWith('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: 'acme', identifier: 'a@acme.test', otpToken: 't'.repeat(43), code: '123456' }),
      });
      expect(login).toHaveBeenCalledWith('acme', accessToken);
      expect(push).toHaveBeenCalledWith(roleToLandingPath('panel'));
    });

    it('a mobile number can ask for WhatsApp; an account with a factor then gets the second step', async () => {
      const hook = await sendCode('98765 43210', 'whatsapp');
      expect(api).toHaveBeenLastCalledWith('/auth/otp/start', { method: 'POST', body: JSON.stringify({ organizationSlug: 'acme', identifier: '98765 43210', channel: 'whatsapp' }) });
      act(() => hook.result.current.setOtpCode('123456'));
      api.mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['totp', 'recovery_code'] });
      await act(() => hook.result.current.verifyOtp(submitEvent));
      expect(hook.result.current.challenge).toEqual({ mfaRequired: true, mfaToken: 'pending', factors: ['totp', 'recovery_code'] });
      expect(login).not.toHaveBeenCalled();
    });

    it('shows a refused code or a cooldown as an error', async () => {
      const hook = await sendCode('a@acme.test');
      api.mockRejectedValueOnce(new Error('That code is not right or has expired. Ask for a new one.'));
      await act(() => hook.result.current.verifyOtp(submitEvent));
      expect(hook.result.current.error).toBe('That code is not right or has expired. Ask for a new one.');
      api.mockRejectedValueOnce(new Error('Please wait before asking for another code.'));
      await act(() => hook.result.current.sendOtp());
      expect(hook.result.current.error).toBe('Please wait before asking for another code.');
      expect(hook.result.current.submitting).toBe(false);
    });

    it('sends the fallback second-factor code for the pending sign-in', async () => {
      api.mockResolvedValueOnce({ mfaRequired: true, mfaToken: 'pending', factors: ['totp', 'otp'] });
      const hook = await submitPassword();
      api.mockResolvedValueOnce({ expiresInSeconds: 300, resendAfterSeconds: 60 });
      await act(() => hook.result.current.sendSecondFactorCode('sms'));
      expect(api).toHaveBeenLastCalledWith('/auth/mfa/otp/send', { method: 'POST', body: JSON.stringify({ mfaToken: 'pending', channel: 'sms' }) });
    });
  });

  // The YukthiX sign-in page (/yx/sign-in).
  describe('yx option', () => {
    it('sends an account that must enrol to the YukthiX set-up page', async () => {
      api.mockResolvedValueOnce({ accessToken: fakeJwt({ role: 'org_admin' }), mfa: { required: true, enrolmentDueAt: '2026-10-20T00:00:00Z' } });
      const hook = renderHook(() => useStaffLogin({ enrolPath: '/yx/setup-mfa', yx: true }));
      await act(() => hook.result.current.handleSubmit());
      expect(push).toHaveBeenCalledWith('/yx/setup-mfa');
    });

    it('marks an SSO start from the YukthiX page, and clears the mark from the classic page', async () => {
      const assign = goTo as jest.Mock;
      assign.mockClear();
      api.mockResolvedValue({ url: 'https://idp.example.test/start' });
      const yx = renderHook(() => useStaffLogin({ yx: true }));
      act(() => yx.result.current.setEmail('a@acme.test'));
      await act(() => yx.result.current.startSso());
      expect(window.sessionStorage.getItem('yx')).toBe('1');
      expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ organizationSlug: '', email: 'a@acme.test' });
      const classic = renderHook(() => useStaffLogin());
      await act(() => classic.result.current.startSso('p-1'));
      expect(window.sessionStorage.getItem('yx')).toBeNull();
      expect(assign).toHaveBeenCalledWith('https://idp.example.test/start');
    });

    it('resetOtp goes back to asking for a code without leaving code mode', async () => {
      api.mockResolvedValueOnce({ otpToken: 't1' });
      const hook = renderHook(() => useStaffLogin());
      act(() => {
        hook.result.current.toggleOtpMode();
        hook.result.current.setIdentifier('a@acme.test');
      });
      await act(() => hook.result.current.sendOtp());
      expect(hook.result.current.otpSent).not.toBeNull();
      act(() => hook.result.current.resetOtp());
      expect(hook.result.current.otpSent).toBeNull();
      expect(hook.result.current.otpMode).toBe(true);
    });
  });
});
