import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffLogin } from '../../lib/hooks/useStaffLogin';
import YxSignInPage from './sign-in/page';
import YxMySecurityPage from './(app)/me/security/page';
import YxLoginActivityPage from './(app)/admin/login-activity/page';
import YxSecuritySettingsPage from './(app)/settings/security/page';
import YxAppLayout from './(app)/layout';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn(), YX_SSO_RETURN_KEY: 'yxSsoReturn' }));
jest.mock('../../lib/hooks/useStaffLogin', () => ({ useStaffLogin: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Divya Raghunathan', email: 'divya.r@kaverifoods.in' } }) }));
jest.mock('@simplewebauthn/browser', () => ({ startAuthentication: jest.fn(), startRegistration: jest.fn() }));

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
  passwordMinLength: 12, ipAllowlistDesk: [], ipAllowlistAdmin: [], ipAllowlistApi: [], ssoOnly: false, breakGlassUserIds: [], otpSignInChannels: [], maxFailedAttempts: 10, lockMinutes: 15,
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

describe('/yx/sign-in', () => {
  const login = () => ({
    organizationSlug: 'kaveri-foods', setOrganizationSlug: jest.fn(), email: '', setEmail: jest.fn(), password: '', setPassword: jest.fn(),
    identifier: '', setIdentifier: jest.fn(), otpCode: '', setOtpCode: jest.fn(), otpMode: false, toggleOtpMode: jest.fn(), resetOtp: jest.fn(),
    otpSent: null, sendOtp: jest.fn(), verifyOtp: jest.fn(), handleSubmit: jest.fn(), error: null, submitting: false,
    branding: { name: 'Kaveri Foods Pvt Ltd' }, ssoProviders: [{ id: 'p-1', name: 'Kaveri Workspace', type: 'oidc_google' }], startSso: jest.fn(),
    challenge: null, verifySecondFactor: jest.fn(), secondFactorPasskeyOptions: jest.fn(), sendSecondFactorCode: jest.fn(), cancelChallenge: jest.fn(),
  });

  it('wires the YukthiX sign-in to the existing login flow', async () => {
    const s = login();
    (useStaffLogin as jest.Mock).mockReturnValue(s);
    render(<YxSignInPage />);
    expect(useStaffLogin).toHaveBeenCalledWith({ enrolPath: '/yx/setup-mfa', yx: true });
    expect(screen.getByText('to Kaveri Foods Pvt Ltd')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(s.startSso).toHaveBeenCalledWith('p-1');
    await userEvent.click(screen.getByRole('radio', { name: 'One-time code' }));
    expect(s.toggleOtpMode).toHaveBeenCalledTimes(1);
  });

  it('shows the second step while a challenge is pending', () => {
    (useStaffLogin as jest.Mock).mockReturnValue({ ...login(), challenge: { mfaRequired: true, mfaToken: 't', factors: ['totp'] } });
    render(<YxSignInPage />);
    expect(screen.getByRole('heading', { name: "Confirm it's you" })).toBeInTheDocument();
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
});

describe('/yx/settings/security', () => {
  it('sends only the changed fields', async () => {
    route({
      'GET /security/policy': { policy: POLICY, floor: FLOOR, updatedAt: null },
      'GET /security/identity-providers': [],
      'GET /users': { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
      'PATCH /security/policy': { policy: { ...POLICY, mfaScope: 'all' }, floor: FLOOR, updatedAt: NOW },
    });
    wrap(<YxSecuritySettingsPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Everyone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/security/policy', { method: 'PATCH', body: JSON.stringify({ mfaScope: 'all' }) }, 'tok'));
  });

  it('shows "no access" on a plain 403', async () => {
    route({
      'GET /security/policy': Object.assign(new Error('Forbidden'), { status: 403 }),
      'GET /security/identity-providers': [],
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
    const nav = screen.getByRole('navigation', { name: 'Security' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['My security']);
  });

  it('tells an admin past the grace period to set up a second step', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/settings/security');
    route({ 'GET /auth/mfa': { ...MFA, factors: [], enrolmentDueAt: '2026-01-01T00:00:00Z' } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(await screen.findByRole('link', { name: 'Set it up now' })).toHaveAttribute('href', '/yx/me/security');
  });

  it('sends a signed-out visitor to the sign-in page', () => {
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
    (useAuth as jest.Mock).mockReturnValue({ accessToken: null, role: null, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(replace).toHaveBeenCalledWith('/yx/sign-in');
    expect(screen.queryByText('page')).toBeNull();
  });
});
