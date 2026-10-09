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

export type LoginResult = 'success' | 'failed' | 'locked' | 'mfa_failed' | 'code_sent' | 'unlocked';

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
  /** Admin list only: this lock row's lock still stands (the API reads the login-protection store), so Unlock does something. */
  lockActive?: boolean;
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The ways in the sign-in screen offers besides the work email (GET /auth/sign-in-options). With a
 * known company, only what its security policy allows; otherwise what YukthiX has set up.
 */
export interface SignInOptions {
  google: boolean;
  microsoft: boolean;
  /** One-time code to a mobile number by SMS / WhatsApp. */
  sms: boolean;
  whatsapp: boolean;
  /** "Email me a code instead" on the password step. */
  emailCode: boolean;
  /** "Sign in with a passkey" (passwordless): the known company allows passkeys and is not SSO-only. */
  passkey?: boolean;
}

export interface SsoProviderOption {
  id: string;
  name: string;
  type: 'saml' | 'oidc_google' | 'oidc_entra' | 'oidc_generic';
}

/** A company email domain and whether the company has proven it owns it (DNS TXT). */
export interface EmailDomainRow {
  domain: string;
  verifiedAt: string | null;
  /** Set when daily re-checks stopped finding the TXT record: no longer routes until checked again. */
  lapsedAt?: string | null;
  /** The TXT record to publish on the domain itself. */
  txtRecord: { name: string; value: string };
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
  /** Account locks on this many wrong tries in a row (YukthiX: at most 10). */
  maxFailedAttempts: number;
  /** First lock lasts this long; repeat locks double, up to 24 hours (YukthiX: at least 15). */
  lockMinutes: number;
  /** "Continue with Google" / "Continue with Microsoft" on the sign-in screen (off by default). */
  googleSignIn: boolean;
  microsoftSignIn: boolean;
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
  maxFailedAttempts: { min: number; max: number };
  lockMinutes: { min: number; max: number };
}

export interface PersonOption {
  id: string;
  name: string;
  email: string;
}

/** One identity provider as GET /security/identity-providers returns it. The client secret never comes back. */
export interface IdentityProviderDetail extends IdentityProviderRow {
  samlEntityId: string | null;
  samlSsoUrl: string | null;
  samlCertificate: string | null;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  entraTenantId: string | null;
  jitRole: string | null;
  mfaTrusted: boolean;
  /** A client secret is saved (write-only). */
  clientSecretSet: boolean;
}

/** POST / PATCH /security/identity-providers body: only the fields of the provider's type. */
export interface IdentityProviderInput {
  type?: IdentityProviderRow['type'];
  name?: string;
  status?: 'active' | 'disabled';
  domains?: string[];
  samlEntityId?: string;
  samlSsoUrl?: string;
  samlCertificate?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  entraTenantId?: string;
  jitEnabled?: boolean;
  jitRole?: string;
  mfaTrusted?: boolean;
}
