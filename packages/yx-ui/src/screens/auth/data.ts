// Fictional sample data for the security stories and tests. Story world "today": 29 Sep 2026 (IST).
import type { IdentityProviderRow, LoginEventRow, MfaStatus, Page, PersonOption, SecurityFloor, SecurityPolicy, SessionRow, SsoProviderOption } from './types';

export const NOW = new Date('2026-09-29T11:00:00+05:30');

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const EDGE_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0';

export const ORG_NAME = 'Kaveri Foods Pvt Ltd';

export const PROVIDERS: SsoProviderOption[] = [
  { id: 'b3f1c2a4-0000-4000-8000-000000000001', name: 'Kaveri Workspace', type: 'oidc_google' },
  { id: 'b3f1c2a4-0000-4000-8000-000000000002', name: 'Kaveri staff directory', type: 'saml' },
];

export const MFA_ENROLLED: MfaStatus = {
  factors: [
    { id: 'f-1', type: 'passkey', label: 'Office laptop', createdAt: '2026-08-12T09:20:00+05:30', lastUsedAt: '2026-09-29T09:02:00+05:30' },
    { id: 'f-2', type: 'totp', label: 'Authenticator app', createdAt: '2026-08-12T09:24:00+05:30', lastUsedAt: '2026-09-18T18:40:00+05:30' },
  ],
  recoveryCodesRemaining: 8,
  required: true,
  enrolmentDueAt: '2026-08-20T00:00:00+05:30',
  allowedFactors: ['passkey', 'totp'],
  mobileNumber: '+919845012345',
};

export const MFA_NONE: MfaStatus = {
  factors: [],
  recoveryCodesRemaining: 0,
  required: true,
  enrolmentDueAt: '2026-10-08T00:00:00+05:30',
  allowedFactors: ['passkey', 'totp'],
  mobileNumber: null,
};

export const RECOVERY_CODES = ['7KQ4-M2XD-9PLA', 'H3VN-8WTR-2CYE', 'Q9ZB-4FJK-6MUD', 'T2LP-7HXS-3NWA', 'C8RD-5GEY-1VKM', 'W6NA-3QTB-8ZPF', 'E4JX-9KCL-2RHV', 'Y1MS-6DWU-5TGB', 'P5HF-2ZNA-7XQE', 'R3GC-8VYK-4LMJ'];

export const TOTP_SETUP = {
  secret: 'JBSWY3DPEHPK3PXPKAVERI',
  // A 1x1 pixel stands in for the QR image in stories.
  qrDataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
};

export const MY_SESSIONS: SessionRow[] = [
  { id: 's-1', method: 'password', assuranceLevel: 'aal2', userAgent: CHROME_WIN, ipAddress: '103.21.58.44', geo: 'Bengaluru', createdAt: '2026-09-29T09:02:00+05:30', lastSeenAt: '2026-09-29T10:58:00+05:30', absoluteExpiresAt: '2026-09-29T21:02:00+05:30', current: true },
  { id: 's-2', method: 'oidc', assuranceLevel: 'aal2', userAgent: SAFARI_IOS, ipAddress: '49.207.12.8', geo: null, createdAt: '2026-09-29T07:45:00+05:30', lastSeenAt: '2026-09-29T08:10:00+05:30', absoluteExpiresAt: '2026-09-29T19:45:00+05:30' },
];

const ev = (id: string, at: string, result: LoginEventRow['result'], method: string, extra: Partial<LoginEventRow> = {}): LoginEventRow => ({
  id,
  userId: 'u-1',
  identifier: 'divya.r@kaverifoods.in',
  result,
  method,
  reason: null,
  ipAddress: '103.21.58.44',
  userAgent: CHROME_WIN,
  geo: null,
  newDevice: false,
  createdAt: at,
  ...extra,
});

export const MY_HISTORY: Page<LoginEventRow> = {
  data: [
    ev('e-1', '2026-09-29T09:02:00+05:30', 'success', 'password'),
    ev('e-2', '2026-09-29T07:45:00+05:30', 'success', 'oidc', { userAgent: SAFARI_IOS, ipAddress: '49.207.12.8', newDevice: true }),
    ev('e-3', '2026-09-28T18:31:00+05:30', 'mfa_failed', 'totp', { reason: 'wrong_code' }),
    ev('e-4', '2026-09-28T18:30:00+05:30', 'failed', 'password', { reason: 'bad_password' }),
    ev('e-5', '2026-09-26T09:10:00+05:30', 'success', 'password'),
  ],
  total: 5,
  page: 1,
  pageSize: 25,
};

export const PEOPLE: PersonOption[] = [
  { id: 'u-1', name: 'Divya Raghunathan', email: 'divya.r@kaverifoods.in' },
  { id: 'u-2', name: 'Lakshmi Venkatesan', email: 'lakshmi.v@kaverifoods.in' },
  { id: 'u-3', name: 'Arjun Kulkarni', email: 'arjun.k@kaverifoods.in' },
  { id: 'u-4', name: 'Suresh Pillai', email: 'suresh.p@kaverifoods.in' },
];

export const ADMINS: PersonOption[] = [PEOPLE[1], PEOPLE[2]];

export const ORG_EVENTS: Page<LoginEventRow> = {
  data: [
    ev('o-1', '2026-09-29T10:41:00+05:30', 'success', 'saml', { identifier: 'suresh.p@kaverifoods.in', userId: 'u-4', userAgent: EDGE_MAC, ipAddress: '103.21.58.51' }),
    ev('o-2', '2026-09-29T10:12:00+05:30', 'locked', 'password', { identifier: 'ramesh.g@kaverifoods.in', userId: 'u-9', userAgent: FIREFOX_LINUX, ipAddress: '185.220.101.7', reason: 'account_locked' }),
    ev('o-3', '2026-09-29T10:11:00+05:30', 'failed', 'password', { identifier: 'ramesh.g@kaverifoods.in', userId: 'u-9', userAgent: FIREFOX_LINUX, ipAddress: '185.220.101.7', reason: 'bad_password' }),
    ev('o-4', '2026-09-29T09:02:00+05:30', 'success', 'password'),
    ev('o-5', '2026-09-29T08:55:00+05:30', 'success', 'otp_sms', { identifier: '+919845098765', userId: 'u-6', userAgent: SAFARI_IOS, ipAddress: '49.207.40.2', newDevice: true }),
    ev('o-6', '2026-09-29T07:45:00+05:30', 'success', 'oidc', { userAgent: SAFARI_IOS, ipAddress: '49.207.12.8', newDevice: true }),
  ],
  total: 6,
  page: 1,
  pageSize: 25,
};

const DIVYA = { email: 'divya.r@kaverifoods.in', name: 'Divya Raghunathan', role: 'recruiter' };

export const ORG_SESSIONS: Page<SessionRow> = {
  data: [
    { ...MY_SESSIONS[0], current: undefined, user: DIVYA },
    { ...MY_SESSIONS[1], current: undefined, user: DIVYA },
    { id: 's-3', method: 'saml', assuranceLevel: 'aal2', userAgent: EDGE_MAC, ipAddress: '103.21.58.51', geo: 'Bengaluru', createdAt: '2026-09-29T10:41:00+05:30', lastSeenAt: '2026-09-29T10:59:00+05:30', absoluteExpiresAt: '2026-09-29T22:41:00+05:30', user: { email: 'suresh.p@kaverifoods.in', name: 'Suresh Pillai', role: 'org_admin' } },
    { id: 's-4', method: 'otp_sms', assuranceLevel: 'aal1', userAgent: SAFARI_IOS, ipAddress: '49.207.40.2', geo: 'Hosur', createdAt: '2026-09-29T08:55:00+05:30', lastSeenAt: '2026-09-29T10:20:00+05:30', absoluteExpiresAt: '2026-09-29T20:55:00+05:30', user: { email: 'meena.s@kaverifoods.in', name: 'Meena Sundaram', role: 'panel' } },
  ],
  total: 4,
  page: 1,
  pageSize: 25,
};

export const FLOOR: SecurityFloor = {
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

export const POLICY: SecurityPolicy = {
  mfaScope: 'sensitive_roles',
  allowedFactors: ['passkey', 'totp'],
  sessionIdleMinutes: null,
  sessionAbsoluteMinutes: null,
  maxConcurrentSessions: null,
  passwordMinLength: 12,
  ipAllowlistDesk: [],
  ipAllowlistAdmin: ['103.21.58.0/24'],
  ipAllowlistApi: ['52.66.14.20/32'],
  ssoOnly: false,
  breakGlassUserIds: [],
  otpSignInChannels: [],
  maxFailedAttempts: 10,
  lockMinutes: 15,
};

export const IDPS: IdentityProviderRow[] = [
  { ...PROVIDERS[0], status: 'active', domains: ['kaverifoods.in'], jitEnabled: true },
  { ...PROVIDERS[1], status: 'disabled', domains: [], jitEnabled: false },
];
