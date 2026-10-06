// Shapes of the sign-in and security APIs (P12, apps/api/src/auth). The screens take these as
// props; the host app fetches them.

/** One second-factor proof, as /auth/mfa/verify and /auth/mfa/step-up take it. */
export type MfaProof = { factor: 'totp' | 'recovery_code' | 'otp'; code: string } | { factor: 'passkey'; credential: unknown };

export interface MfaFactor {
  id: string;
  type: 'passkey' | 'totp';
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MfaStatus {
  factors: MfaFactor[];
  recoveryCodesRemaining: number;
  /** This account must have a second factor (sensitive role, or the company asks everyone). */
  required: boolean;
  enrolmentDueAt: string;
  allowedFactors: string[];
  /** Verified mobile number (E.164), or null. */
  mobileNumber: string | null;
}

export interface SessionRow {
  id: string;
  method: string;
  /** 'aal1' password or code only, 'aal2' with a second step. */
  assuranceLevel: string;
  userAgent: string | null;
  ipAddress: string | null;
  geo: string | null;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
  /** Own sessions: this browser. */
  current?: boolean;
  /** Admin list: whose session. */
  user?: { email: string; name: string | null; role: string };
}

export type LoginResult = 'success' | 'failed' | 'locked' | 'mfa_failed';

export interface LoginEventRow {
  id: string;
  userId: string | null;
  identifier: string;
  result: LoginResult;
  method: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  geo: string | null;
  newDevice: boolean;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SsoProviderOption {
  id: string;
  name: string;
  type: 'saml' | 'oidc_google' | 'oidc_entra' | 'oidc_generic';
}

export interface IdentityProviderRow extends SsoProviderOption {
  status: 'active' | 'disabled';
  domains: string[];
  jitEnabled: boolean;
}

export interface SecurityPolicy {
  mfaScope: 'sensitive_roles' | 'all';
  allowedFactors: string[];
  /** null = YukthiX default. */
  sessionIdleMinutes: number | null;
  sessionAbsoluteMinutes: number | null;
  maxConcurrentSessions: number | null;
  passwordMinLength: number;
  ipAllowlistDesk: string[];
  ipAllowlistAdmin: string[];
  ipAllowlistApi: string[];
  ssoOnly: boolean;
  breakGlassUserIds: string[];
  otpSignInChannels: string[];
}

/** The YukthiX floor (Q8): companies may only be stricter. Returned with the policy. */
export interface SecurityFloor {
  passwordMinLength: number;
  passwordMaxLength: number;
  sessionIdleMinutes: { min: number; max: number };
  sessionAbsoluteMinutes: { min: number; max: number };
  maxConcurrentSessions: { min: number; max: number };
  ipAllowlistMaxEntries: number;
  breakGlassAccounts: { minWhenSsoOnly: number; max: number };
}

export interface PersonOption {
  id: string;
  name: string;
  email: string;
}
