import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { goTo } from '../../lib/navigate';
import { useAuth } from '../../lib/auth-context';
import YxSignInPage from './sign-in/page';
import YxSignInCallbackPage from './sign-in/callback/page';
import { OPTIONS_RETRY_MS, PASSKEY_FAILED, SOCIAL_FAILED } from '../../lib/hooks/useYxSignIn';
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication } from '@simplewebauthn/browser';
import YxForgotPasswordPage from './forgot-password/page';
import YxResetPasswordPage from './reset-password/[token]/page';
import YxMySecurityPage from './(app)/me/security/page';
import YxLoginActivityPage from './(app)/admin/login-activity/page';
import YxSecuritySettingsPage from './(app)/settings/security/page';
import YxAppLayout from './(app)/layout';
import YxSetupMfaPage from './setup-mfa/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useParams: () => ({ token: 'tok-123' }) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/navigate', () => ({ goTo: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/bot-challenge', () => ({ botChallengeToken: async () => null }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Divya Raghunathan', email: 'divya.r@kaverifoods.in' } }) }));
jest.mock('@simplewebauthn/browser', () => ({
  startAuthentication: jest.fn(),
  startRegistration: jest.fn(),
  browserSupportsWebAuthn: jest.fn(() => false),
  browserSupportsWebAuthnAutofill: jest.fn(async () => false),
  WebAuthnAbortService: { cancelCeremony: jest.fn() },
}));

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const NOW = '2026-09-29T09:02:00+05:30';
const SESSION = { id: 's-2', method: 'password', assuranceLevel: 'aal2', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', ipAddress: '49.207.12.8', geo: null, createdAt: NOW, lastSeenAt: NOW, absoluteExpiresAt: NOW };
const MFA = { factors: [{ id: 'f-1', type: 'passkey', label: 'Office laptop', createdAt: NOW, lastUsedAt: null }], recoveryCodesRemaining: 10, required: true, enrolmentDueAt: NOW, allowedFactors: ['passkey', 'totp'], mobileNumber: null };
const EMPTY_PAGE = { data: [], total: 0, page: 1, pageSize: 25 };
const FLOOR = {
  passwordMinLength: 12,
  passwordMaxLength: 128,
  sessionIdleMinutes: { min: 5, max: 480 },
  sessionAbsoluteMinutes: { min: 30, max: 720 },
  maxConcurrentSessions: { min: 1, max: 100 },
  ipAllowlistMaxEntries: 100,
  breakGlassAccounts: { minWhenSsoOnly: 2, max: 10 },
  maxFailedAttempts: { min: 3, max: 10 },
  lockMinutes: { min: 15, max: 1440 },
};
const POLICY = {
  mfaScope: 'sensitive_roles', allowedFactors: ['passkey', 'totp'], sessionIdleMinutes: null, sessionAbsoluteMinutes: null, maxConcurrentSessions: null,
  passwordMinLength: 12, ipAllowlistDesk: [], ipAllowlistAdmin: [], ipAllowlistApi: [], ssoOnly: false, breakGlassUserIds: [], otpSignInChannels: [],
  maxFailedAttempts: 10, lockMinutes: 15, googleSignIn: false, microsoftSignIn: false,
};

const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/me/security');
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/sign-in (email first, no company code)', () => {
  const token = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;
  const KAVERI = { id: 'c-1', name: 'Kaveri Foods Pvt Ltd', logoUrl: null };
  const CASTINGS = { id: 'c-2', name: 'Hosur Precision Castings', logoUrl: null };
  let push: jest.Mock;
  let login: jest.Mock;
  const assign = goTo as jest.Mock;

  beforeEach(() => {
    push = jest.fn();
    login = jest.fn();
    assign.mockReset();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ login });
  });
  const typeIdentifier = async (value: string) => {
    await userEvent.type(screen.getByLabelText(/Work email/), value);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('asks for the email first, then the password; one company signs straight in', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { accessToken: token({ role: 'recruiter' }) },
      'GET /rbac/me/permissions': ['exam:manage', 'results:view'],
    });
    render(<YxSignInPage />);
    expect(screen.queryByLabelText(/company/i)).toBeNull();
    await typeIdentifier('divya.r@kaverifoods.in');
    expect(api).toHaveBeenCalledWith('/auth/identify', { method: 'POST', body: JSON.stringify({ identifier: 'divya.r@kaverifoods.in' }) });
    await userEvent.type(await screen.findByLabelText(/^Password/), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/today'));
    expect(api).toHaveBeenCalledWith('/auth/staff/login', { method: 'POST', body: JSON.stringify({ identifier: 'divya.r@kaverifoods.in', password: 'correct horse battery' }) });
    expect(login).toHaveBeenCalledWith('', expect.any(String));
  });

  it('returns to a same-site ?next= (e.g. from an old /login?next= link) instead of the landing', async () => {
    window.history.replaceState(null, '', '/yx/sign-in?next=/v2/questions');
    try {
      route({
        'GET /auth/remembered-company': { company: null },
        'POST /auth/identify': { next: 'password', providers: [] },
        'POST /auth/staff/login': { accessToken: token({ role: 'recruiter' }) },
      });
      render(<YxSignInPage />);
      await typeIdentifier('divya.r@kaverifoods.in');
      await userEvent.type(await screen.findByLabelText(/^Password/), 'correct horse battery');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/questions'));
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('a credential that opens several companies: "Choose your company", then that company', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { selectionRequired: true, selectionToken: 't'.repeat(43), companies: [KAVERI, CASTINGS], expiresInSeconds: 120 },
      'POST /auth/staff/select-company': { accessToken: token({ role: 'org_admin' }) },
      'GET /rbac/me/permissions': ['exam:manage', 'employee.profile.view'],
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Choose your company' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: CASTINGS.name }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/people/directory'));
    expect(api).toHaveBeenCalledWith('/auth/staff/select-company', { method: 'POST', body: JSON.stringify({ selectionToken: 't'.repeat(43), organizationId: 'c-2' }) });
  });

  it('a failed choice (expired, used) starts the sign-in again with the reason', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { selectionRequired: true, selectionToken: 't'.repeat(43), companies: [KAVERI, CASTINGS], expiresInSeconds: 120 },
      'POST /auth/staff/select-company': new Error('Your sign-in has expired. Please sign in again.'),
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.click(await screen.findByRole('button', { name: KAVERI.name }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in has expired');
    expect(screen.getByLabelText(/Work email/)).toBeInTheDocument();
  });

  it('a domain that uses single sign-on goes straight to the company sign-in page', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'sso', url: 'https://idp.example.test/start' },
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://idp.example.test/start'));
    expect(screen.getByRole('status')).toHaveTextContent("Taking you to your company's sign-in page");
  });

  it('shows the remembered company, and "Not your company?" forgets it', async () => {
    route({ 'GET /auth/remembered-company': { company: { name: KAVERI.name, logoUrl: null } }, 'DELETE /auth/remembered-company': null });
    render(<YxSignInPage />);
    expect(await screen.findByText(KAVERI.name)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not your company?' }));
    await waitFor(() => expect(screen.queryByText(KAVERI.name)).toBeNull());
    expect(api).toHaveBeenCalledWith('/auth/remembered-company', { method: 'DELETE' });
  });

  it('one-time code instead of the password', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/otp/start': { otpToken: 'o'.repeat(43), expiresInSeconds: 300, resendAfterSeconds: 60 },
      'POST /auth/otp/verify': { accessToken: token({ role: 'panel' }) },
      'GET /rbac/me/permissions': ['results:view'],
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await userEvent.click(await screen.findByRole('button', { name: 'Email me a code instead' }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/panel/reports'));
    expect(api).toHaveBeenCalledWith('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ identifier: 'divya.r@kaverifoods.in', otpToken: 'o'.repeat(43), code: '123456' }) });
  });

  it('lands HR without exam/ATS permissions in YukthiX, not the old /v2 app', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { accessToken: token({ role: 'panel' }) },
      'GET /rbac/me/permissions': ['employee.profile.view'],
    });
    render(<YxSignInPage />);
    await typeIdentifier('hr@demo-org.test');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/people/directory'));
    expect(push).not.toHaveBeenCalledWith(expect.stringMatching(/^\/v2/));
  });

  it('without the directory either, lands on My security', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { accessToken: token({ role: 'panel' }) },
      'GET /rbac/me/permissions': [],
    });
    render(<YxSignInPage />);
    await typeIdentifier('someone@demo-org.test');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/me/security'));
  });

  it('the sign-in throttle (not the account lock) says to wait a minute', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': Object.assign(new Error('Too many attempts. Please wait a minute and try again.'), { status: 429 }),
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries. Wait a minute and try again.');
  });

  it('a wrong code at the second step says so plainly', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { mfaRequired: true, mfaToken: 'm', factors: ['totp'] },
      'POST /auth/mfa/verify': Object.assign(new Error('That verification did not work. Try again.'), { status: 401 }),
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Authenticator app' }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work. Check it and try again.");
  });

  it("other ways that cannot load: retried for about a minute, then a quiet line with Try again", async () => {
    jest.useFakeTimers();
    try {
      let up = false;
      api.mockImplementation(async (path: string) => {
        if (path === '/auth/remembered-company') return { company: null };
        if (path === '/auth/sign-in-options') {
          if (up) return WAYS;
          throw Object.assign(new Error('Too many attempts.'), { status: 429 });
        }
        throw new Error(`unexpected ${path}`);
      });
      render(<YxSignInPage />);
      const tries = () => api.mock.calls.filter(([p]) => p === '/auth/sign-in-options').length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(OPTIONS_RETRY_MS.reduce((a, b) => a + b, 0) - 1000);
      });
      expect(screen.queryByText(/Couldn.t load other sign-in methods/)).toBeNull(); // still trying
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
      expect(tries()).toBe(OPTIONS_RETRY_MS.length + 1);
      expect(OPTIONS_RETRY_MS.reduce((a, b) => a + b, 0)).toBe(60_000);
      expect(screen.getByText(/Couldn.t load other sign-in methods/)).toBeInTheDocument();

      up = true;
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      });
      expect(await screen.findByRole('group', { name: 'Other ways to sign in' })).toBeInTheDocument();
      expect(screen.queryByText(/Couldn.t load other sign-in methods/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('?next= survives the round trip to Google and back', async () => {
    window.history.replaceState(null, '', '/yx/sign-in?next=%2Fyx%2Fpayroll%2Fruns');
    try {
      route({
        'GET /auth/remembered-company': { company: null },
        'GET /auth/sign-in-options': WAYS,
        'POST /auth/social/google/start': { url: 'https://accounts.example.test/auth?state=s' },
      });
      const first = render(<YxSignInPage />);
      await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
      await waitFor(() => expect(assign).toHaveBeenCalled());
      first.unmount();

      window.history.replaceState(null, '', '/yx/sign-in/callback#code=round-trip');
      route({
        'GET /auth/remembered-company': { company: null },
        'GET /auth/sign-in-options': WAYS,
        'POST /auth/social/exchange': { accessToken: token({ role: 'recruiter' }) },
      });
      render(<YxSignInCallbackPage />);
      await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/payroll/runs'));
    } finally {
      window.history.replaceState(null, '', '/');
      window.sessionStorage.clear();
    }
  });

  it('shows the second step while a challenge is pending', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'POST /auth/identify': { next: 'password', providers: [] },
      'POST /auth/staff/login': { mfaRequired: true, mfaToken: 'm', factors: ['totp'] },
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await userEvent.type(await screen.findByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: "Confirm it's you" })).toBeInTheDocument();
  });

  const WAYS = { google: true, microsoft: true, sms: true, whatsapp: false, emailCode: true };

  it('offers only the ways the API says are on; "Continue with Google" goes to Google', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'GET /auth/sign-in-options': { ...WAYS, microsoft: false },
      'POST /auth/social/google/start': { url: 'https://accounts.example.test/auth?state=s' },
    });
    render(<YxSignInPage />);
    const ways = within(await screen.findByRole('group', { name: 'Other ways to sign in' })).getAllByRole('button');
    expect(ways.map((b) => b.textContent)).toEqual(['Continue with mobile', 'Continue with Google']);
    await userEvent.click(ways[1]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example.test/auth?state=s'));
    expect(api).toHaveBeenCalledWith('/auth/social/google/start', { method: 'POST', body: '{}' });
    expect(screen.getByRole('status')).toHaveTextContent('Taking you to Google');
  });

  it('no ways answered (or not set up): only the work email', async () => {
    route({ 'GET /auth/remembered-company': { company: null } });
    render(<YxSignInPage />);
    await screen.findByLabelText(/Work email/);
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('Continue with mobile: the number, a code by SMS, then signed in', async () => {
    route({
      'GET /auth/remembered-company': { company: null },
      'GET /auth/sign-in-options': WAYS,
      'POST /auth/otp/start': { otpToken: 'o'.repeat(43), expiresInSeconds: 300, resendAfterSeconds: 60 },
      'POST /auth/otp/verify': { accessToken: token({ role: 'recruiter' }) },
      'GET /rbac/me/permissions': ['exam:manage'],
    });
    render(<YxSignInPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with mobile' }));
    await userEvent.type(screen.getByLabelText(/Mobile number/), '98450 12345');
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(api).toHaveBeenCalledWith('/auth/otp/start', { method: 'POST', body: JSON.stringify({ identifier: '98450 12345', channel: 'sms' }) });
    expect(await screen.findByRole('status')).toHaveTextContent('by SMS');
    await userEvent.type(screen.getByLabelText(/6-digit code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/today'));
    expect(api).toHaveBeenCalledWith('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ identifier: '98450 12345', otpToken: 'o'.repeat(43), code: '123456' }) });
  });

  describe('Sign in with a passkey (passwordless)', () => {
    const start = startAuthentication as jest.Mock;
    const CREDENTIAL = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {}, clientExtensionResults: {} };
    beforeEach(() => {
      start.mockReset();
      (browserSupportsWebAuthn as jest.Mock).mockReturnValue(true);
    });
    afterEach(() => {
      (browserSupportsWebAuthn as jest.Mock).mockReturnValue(false);
      (browserSupportsWebAuthnAutofill as jest.Mock).mockResolvedValue(false);
    });

    it('heads the other ways; the passkey alone signs in and lands like any sign-in', async () => {
      route({
        'GET /auth/remembered-company': { company: null },
        'GET /auth/sign-in-options': { ...WAYS, passkey: true },
        'POST /auth/passkey/options': { challenge: 'chal-1', userVerification: 'required' },
        'POST /auth/passkey/verify': { accessToken: token({ role: 'recruiter' }) },
        'GET /rbac/me/permissions': ['exam:manage', 'results:view'],
      });
      start.mockResolvedValue(CREDENTIAL);
      render(<YxSignInPage />);
      const ways = within(await screen.findByRole('group', { name: 'Other ways to sign in' })).getAllByRole('button');
      expect(ways[0]).toHaveTextContent('Sign in with a passkey');
      expect(screen.getByLabelText(/Work email/)).toHaveAttribute('autocomplete', 'username webauthn');
      await userEvent.click(ways[0]);
      await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/today'));
      expect(start).toHaveBeenCalledWith({ optionsJSON: { challenge: 'chal-1', userVerification: 'required' }, useBrowserAutofill: false });
      expect(api).toHaveBeenCalledWith('/auth/passkey/verify', { method: 'POST', body: JSON.stringify({ credential: CREDENTIAL }) });
      expect(login).toHaveBeenCalledWith('', expect.any(String));
    });

    it('not offered where the browser cannot, or the company does not allow passkeys', async () => {
      route({ 'GET /auth/remembered-company': { company: null }, 'GET /auth/sign-in-options': { ...WAYS, passkey: false } });
      const { unmount } = render(<YxSignInPage />);
      await screen.findByRole('group', { name: 'Other ways to sign in' });
      expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
      unmount();
      (browserSupportsWebAuthn as jest.Mock).mockReturnValue(false);
      route({ 'GET /auth/remembered-company': { company: null }, 'GET /auth/sign-in-options': { ...WAYS, passkey: true } });
      render(<YxSignInPage />);
      await screen.findByRole('group', { name: 'Other ways to sign in' });
      expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
    });

    it("the work-email field's autofill offers passkeys; picking one signs in", async () => {
      (browserSupportsWebAuthnAutofill as jest.Mock).mockResolvedValue(true);
      route({
        'GET /auth/remembered-company': { company: null },
        'GET /auth/sign-in-options': { ...WAYS, passkey: true },
        'POST /auth/passkey/options': { challenge: 'chal-2' },
        'POST /auth/passkey/verify': { accessToken: token({ role: 'recruiter' }) },
        'GET /rbac/me/permissions': ['exam:manage'],
      });
      start.mockResolvedValue(CREDENTIAL);
      render(<YxSignInPage />);
      await waitFor(() => expect(start).toHaveBeenCalledWith({ optionsJSON: { challenge: 'chal-2' }, useBrowserAutofill: true }));
      await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/today'));
    });

    it('a refused passkey says so; a closed prompt says nothing', async () => {
      route({
        'GET /auth/remembered-company': { company: null },
        'GET /auth/sign-in-options': { ...WAYS, passkey: true },
        'POST /auth/passkey/options': { challenge: 'chal-3' },
        'POST /auth/passkey/verify': new Error(PASSKEY_FAILED),
      });
      start.mockRejectedValueOnce(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));
      render(<YxSignInPage />);
      const button = await screen.findByRole('button', { name: 'Sign in with a passkey' });
      await userEvent.click(button);
      await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
      start.mockResolvedValue(CREDENTIAL);
      await userEvent.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent(PASSKEY_FAILED);
      expect(push).not.toHaveBeenCalled();
    });
  });

  it('a known company with email codes off: no "Email me a code instead"', async () => {
    route({
      'GET /auth/remembered-company': { company: { name: KAVERI.name, logoUrl: null } },
      'GET /auth/sign-in-options': { ...WAYS, emailCode: false },
      'POST /auth/identify': { next: 'password', providers: [] },
    });
    render(<YxSignInPage />);
    await typeIdentifier('divya.r@kaverifoods.in');
    await screen.findByLabelText(/^Password/);
    expect(screen.queryByRole('button', { name: 'Email me a code instead' })).toBeNull();
  });
});

describe('/yx/sign-in/callback (back from Google / Microsoft)', () => {
  const token = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;
  let push: jest.Mock;
  let login: jest.Mock;
  beforeEach(() => {
    push = jest.fn();
    login = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ login });
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('trades the code from the fragment once, wipes it, and signs in', async () => {
    window.history.replaceState(null, '', '/yx/sign-in/callback#code=c0de');
    route({
      'GET /auth/remembered-company': { company: null },
      'GET /auth/sign-in-options': { google: true, microsoft: true, sms: false, whatsapp: false, emailCode: true },
      'POST /auth/social/exchange': { accessToken: token({ role: 'recruiter' }) },
      'GET /rbac/me/permissions': ['exam:manage'],
    });
    render(<YxSignInCallbackPage />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/v2/today'));
    expect(api).toHaveBeenCalledWith('/auth/social/exchange', { method: 'POST', body: JSON.stringify({ code: 'c0de' }) });
    expect(api.mock.calls.filter(([p]) => p === '/auth/social/exchange')).toHaveLength(1);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/yx/sign-in');
    expect(login).toHaveBeenCalledWith('', expect.any(String));
  });

  it('Strict Mode and a remount still trade the single-use code once', async () => {
    window.history.replaceState(null, '', '/yx/sign-in/callback#code=strict-1');
    route({
      'GET /auth/remembered-company': { company: null },
      'GET /auth/sign-in-options': { google: true, microsoft: true, sms: false, whatsapp: false, emailCode: true },
      'POST /auth/social/exchange': { accessToken: token({ role: 'recruiter' }) },
      'GET /rbac/me/permissions': ['exam:manage'],
    });
    const first = render(
      <StrictMode>
        <YxSignInCallbackPage />
      </StrictMode>,
    );
    await waitFor(() => expect(push).toHaveBeenCalled());
    first.unmount();
    window.history.replaceState(null, '', '/yx/sign-in/callback#code=strict-1'); // the same code again
    render(<YxSignInCallbackPage />);
    await new Promise((r) => setTimeout(r, 50));
    expect(api.mock.calls.filter(([p]) => p === '/auth/social/exchange')).toHaveLength(1);
  });

  it('several companies: the company choice', async () => {
    window.history.replaceState(null, '', '/yx/sign-in/callback#code=c0de2');
    route({
      'GET /auth/remembered-company': { company: null },
      'GET /auth/sign-in-options': { google: true, microsoft: true, sms: false, whatsapp: false, emailCode: true },
      'POST /auth/social/exchange': { selectionRequired: true, selectionToken: 't'.repeat(43), companies: [{ id: 'c-1', name: 'Kaveri Foods Pvt Ltd', logoUrl: null }], expiresInSeconds: 120 },
    });
    render(<YxSignInCallbackPage />);
    expect(await screen.findByRole('heading', { name: 'Choose your company' })).toBeInTheDocument();
  });

  it('any failure: one message whatever the reason, and the sign-in screen again', async () => {
    window.history.replaceState(null, '', '/yx/sign-in/callback#error=signin_failed');
    route({ 'GET /auth/remembered-company': { company: null } });
    render(<YxSignInCallbackPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(SOCIAL_FAILED);
    expect(screen.getByLabelText(/Work email/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith('/auth/social/exchange', expect.anything());

    window.history.replaceState(null, '', '/yx/sign-in/callback#code=spent');
    route({ 'GET /auth/remembered-company': { company: null }, 'POST /auth/social/exchange': new Error('Invalid credentials') });
    render(<YxSignInCallbackPage />);
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent === SOCIAL_FAILED)).toBe(true));
    expect(screen.queryByText('Invalid credentials')).toBeNull();
  });
});

describe('/yx/forgot-password', () => {
  it('asks for the work email only', async () => {
    route({ 'POST /auth/forgot-password': { message: 'ok' } });
    render(<YxForgotPasswordPage />);
    expect(screen.queryByLabelText(/company/i)).toBeNull();
    await userEvent.type(screen.getByLabelText(/Work email/), 'divya.r@kaverifoods.in');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('we sent it a reset link');
    expect(api).toHaveBeenCalledWith('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: 'divya.r@kaverifoods.in' }) });
  });
});

describe('/yx/reset-password/[token]', () => {
  it('sets the new password with the token from the link, then sends the person to the YukthiX sign-in', async () => {
    route({ 'POST /auth/reset-password': { success: true } });
    render(<YxResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/New password/), 'Kaveri-Recruit-Oct26');
    await userEvent.type(screen.getByLabelText(/Type it again/), 'Kaveri-Recruit-Oct26');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your new password works now');
    expect(api).toHaveBeenCalledWith('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: 'tok-123', newPassword: 'Kaveri-Recruit-Oct26' }) });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/yx/sign-in');
  });

  it('shows why a password was refused and keeps the form', async () => {
    route({ 'POST /auth/reset-password': new Error('This password has appeared in a known data breach. Choose a different one.') });
    render(<YxResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/New password/), 'Password123456');
    await userEvent.type(screen.getByLabelText(/Type it again/), 'Password123456');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText(/known data breach/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeInTheDocument();
  });
});

describe('/yx/me/security', () => {
  it('loads factors, sessions and history, and signs out another session', async () => {
    route({
      'GET /auth/mfa': MFA,
      'GET /auth/sessions': [{ ...SESSION, id: 's-1', current: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36' }, SESSION],
      'GET /auth/login-history': EMPTY_PAGE,
      'DELETE /auth/sessions/s-2': null,
    });
    wrap(<YxMySecurityPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Sign out Safari on iOS/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/sessions/s-2', { method: 'DELETE' }, 'tok'));
  });

  it('renames a passkey (the API asks for step-up)', async () => {
    route({ 'GET /auth/mfa': MFA, 'GET /auth/sessions': [], 'GET /auth/login-history': EMPTY_PAGE, 'PATCH /auth/mfa/authenticators/f-1': null });
    wrap(<YxMySecurityPage />);
    expect(await screen.findByText('Passkey · Office laptop')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rename Office laptop' }));
    const field = within(screen.getByRole('dialog')).getByRole('textbox', { name: /Name/ });
    await userEvent.clear(field);
    await userEvent.type(field, 'Work laptop');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/mfa/authenticators/f-1', { method: 'PATCH', body: JSON.stringify({ label: 'Work laptop' }) }, 'tok'));
  });

  it('asks the API for every unsuccessful attempt under "Failed"', async () => {
    route({ 'GET /auth/mfa': MFA, 'GET /auth/sessions': [], 'GET /auth/login-history': EMPTY_PAGE });
    wrap(<YxMySecurityPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Failed' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/login-history?result=unsuccessful&page=1&pageSize=25', {}, 'tok'));
  });
});

describe('/yx/admin/login-activity', () => {
  it('counts failed attempts in the last 24 hours and lists sessions', async () => {
    route({
      'GET /security/login-events': { ...EMPTY_PAGE, total: 3 },
      'GET /security/sessions': { ...EMPTY_PAGE, data: [{ ...SESSION, user: { email: 'suresh.p@kaverifoods.in', name: 'Suresh Pillai', role: 'org_admin' } }], total: 1 },
      'GET /users': { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });
    wrap(<YxLoginActivityPage />);
    expect(await screen.findByText('3 failed attempts in the last 24 hours')).toBeInTheDocument();
    expect(api.mock.calls.some(([p]) => /^\/security\/login-events\?result=unsuccessful&from=.+&pageSize=1$/.test(p))).toBe(true);
  });

  it('says "no access" to someone without the permission, not "check your connection"', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
    route({ 'GET /security/login-events': forbidden, 'GET /security/sessions': forbidden, 'GET /users': forbidden });
    wrap(<YxLoginActivityPage />);
    expect(await screen.findByText("You don't have access to login activity")).toBeInTheDocument();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
  });
});

describe('/yx/settings/security', () => {
  it('sends only the changed fields', async () => {
    route({
      'GET /security/policy': { policy: POLICY, floor: FLOOR, updatedAt: null },
      'GET /security/identity-providers': [],
      'GET /security/identity-providers/domains': [],
      'GET /users': { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
      'PATCH /security/policy': { policy: { ...POLICY, mfaScope: 'all' }, floor: FLOOR, updatedAt: NOW },
    });
    wrap(<YxSecuritySettingsPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Everyone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/security/policy', { method: 'PATCH', body: JSON.stringify({ mfaScope: 'all' }) }, 'tok'));
  });

  it("checks a company email domain's TXT record", async () => {
    const IDP = { id: 'p-1', name: 'Kaveri staff directory', type: 'saml', status: 'active', domains: ['kaveri.co.in'], jitEnabled: false };
    const DOMAIN = { domain: 'kaveri.co.in', verifiedAt: null, txtRecord: { name: 'kaveri.co.in', value: 'yukthix-domain-verification=b' } };
    route({
      'GET /security/policy': { policy: POLICY, floor: FLOOR, updatedAt: null },
      'GET /security/identity-providers': [IDP],
      'GET /security/identity-providers/domains': [DOMAIN],
      'GET /users': { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
      'POST /security/identity-providers/domains/verify': { domain: 'kaveri.co.in', verifiedAt: NOW },
    });
    wrap(<YxSecuritySettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check record' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/security/identity-providers/domains/verify', { method: 'POST', body: JSON.stringify({ domain: 'kaveri.co.in' }) }, 'tok'),
    );
  });

  it('shows a domain whose TXT record lapsed, and checks it again', async () => {
    const IDP = { id: 'p-1', name: 'Kaveri staff directory', type: 'saml', status: 'active', domains: ['kaveri.co.in'], jitEnabled: false };
    const DOMAIN = { domain: 'kaveri.co.in', verifiedAt: null, lapsedAt: NOW, txtRecord: { name: 'kaveri.co.in', value: 'yukthix-domain-verification=b' } };
    route({
      'GET /security/policy': { policy: POLICY, floor: FLOOR, updatedAt: null },
      'GET /security/identity-providers': [IDP],
      'GET /security/identity-providers/domains': [DOMAIN],
      'GET /users': { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
      'POST /security/identity-providers/domains/verify': { domain: 'kaveri.co.in', verifiedAt: NOW },
    });
    wrap(<YxSecuritySettingsPage />);
    expect(await screen.findByText('Lapsed')).toBeInTheDocument();
    expect(screen.getByText(/sign-ins no longer go to your identity provider/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check record' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/security/identity-providers/domains/verify', { method: 'POST', body: JSON.stringify({ domain: 'kaveri.co.in' }) }, 'tok'),
    );
  });

  it('shows "no access" on a plain 403', async () => {
    route({
      'GET /security/policy': Object.assign(new Error('Forbidden'), { status: 403 }),
      'GET /security/identity-providers': [],
      'GET /security/identity-providers/domains': [],
      'GET /users': { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });
    wrap(<YxSecuritySettingsPage />);
    expect(await screen.findByText(/a System Admin/)).toBeInTheDocument();
  });
});

describe('/yx layout', () => {
  it('only shows the pages the role can open', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'recruiter', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    route({ 'GET /auth/mfa': MFA });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const nav = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Help centre', 'Service catalogue', 'Approvals', 'My security']);
  });

  it('offers the hiring app only to people with exam/ATS permissions', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'recruiter', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    route({ 'GET /auth/mfa': MFA, 'GET /rbac/me/permissions': ['exam:manage'] });
    const { unmount } = wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(await screen.findByRole('link', { name: 'Hiring and assessments' })).toHaveAttribute('href', '/v2/today');
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    route({ 'GET /auth/mfa': MFA, 'GET /rbac/me/permissions': ['employee.profile.view'] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await screen.findByRole('link', { name: 'Directory' });
    expect(screen.queryByRole('link', { name: /Hiring/ })).toBeNull();
    expect(screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/v2'))).toEqual([]);
  });

  it('tells an admin past the grace period to set up a second step', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/settings/security');
    route({ 'GET /auth/mfa': { ...MFA, factors: [], enrolmentDueAt: '2026-01-01T00:00:00Z' } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(await screen.findByRole('link', { name: 'Set it up now' })).toHaveAttribute('href', '/yx/me/security');
  });

  it('reminds an admin in the grace period, with the date, and lets them work', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/settings/security');
    route({ 'GET /auth/mfa': { ...MFA, factors: [], enrolmentDueAt: '2099-10-21T00:00:00Z' } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(await screen.findByText(/Set it up by 21 Oct 2099/)).toBeInTheDocument();
    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it('marks Identity and bank changes, not Profile, on /yx/people/profile-requests', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    (usePathname as jest.Mock).mockReturnValue('/yx/people/profile-requests');
    route({ 'GET /auth/mfa': MFA, 'GET /rbac/me/permissions': ['employee.profile.view', 'employee.identity.approve'] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(await screen.findByRole('link', { name: 'Identity and bank changes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current');
  });

  it('sends a signed-out visitor to the sign-in page', () => {
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
    (useAuth as jest.Mock).mockReturnValue({ accessToken: null, role: null, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    window.history.replaceState(null, '', '/yx/people/directory?tab=all');
    try {
      wrap(<YxAppLayout><p>page</p></YxAppLayout>);
      expect(replace).toHaveBeenCalledWith('/yx/sign-in?next=%2Fyx%2Fpeople%2Fdirectory%3Ftab%3Dall');
    } finally {
      window.history.replaceState(null, '', '/');
    }
    expect(screen.queryByText('page')).toBeNull();
  });
});

describe('/yx/setup-mfa', () => {
  it('YukthiX staff are offered a security key only, never an authenticator app', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'super_admin', isLoading: false });
    route({
      'GET /auth/mfa': { ...MFA, factors: [], allowedFactors: ['passkey', 'totp'] },
      'GET /rbac/me/permissions': [],
    });
    wrap(<YxSetupMfaPage />);
    expect(await screen.findByRole('button', { name: /Passkey/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authenticator app/ })).toBeNull();
  });

  it('a company admin sees what the company allows', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', isLoading: false });
    route({
      'GET /auth/mfa': { ...MFA, factors: [], allowedFactors: ['passkey', 'totp'] },
      'GET /rbac/me/permissions': [],
    });
    wrap(<YxSetupMfaPage />);
    expect(await screen.findByRole('button', { name: /Authenticator app/ })).toBeInTheDocument();
  });
});
