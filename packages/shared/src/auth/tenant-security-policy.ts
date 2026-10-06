import { TenantSecurityPolicy } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { isIpAllowed } from '../network/ip-range';
import { SESSION_ABSOLUTE_MAX_SECONDS, SESSION_IDLE_MAX_SECONDS, staffSessionLimits } from './staff-session';

// The YukthiX floor (P12 Q8 / D17): a company's security policy may only be stricter than this.
// The same bounds are CHECK constraints on tenant_security_policies
// (migration 20261006100000_tenant_security_policies) -- change both together.
export const TENANT_SECURITY_FLOOR = {
  passwordMinLength: 12,
  // ASVS 2.1.2: at least 64 allowed; capped so one sign-in cannot buy unbounded argon2 work.
  passwordMaxLength: 128,
  sessionIdleMinutes: { min: 5, max: SESSION_IDLE_MAX_SECONDS / 60 },
  sessionAbsoluteMinutes: { min: 30, max: SESSION_ABSOLUTE_MAX_SECONDS / 60 },
  maxConcurrentSessions: { min: 1, max: 100 },
  ipAllowlistMaxEntries: 100,
  breakGlassAccounts: { minWhenSsoOnly: 2, max: 10 },
  mfaScopes: ['sensitive_roles', 'all'],
  factors: ['passkey', 'totp', 'otp'],
  // OTP is a fallback only (YX-IAM-03): at least one of these must stay allowed.
  primaryFactors: ['passkey', 'totp'],
  // One-time-code sign-in (AAL1) channels a company may turn on; off unless it does.
  otpSignInChannels: ['email', 'sms', 'whatsapp'],
  // Account lockout (YX-IAM-07): lock no later than the 10th consecutive failure, for no less than
  // 15 minutes (the first lock; later ones double, capped at 24 h). Migration 20261006600000.
  maxFailedAttempts: { min: 3, max: 10 },
  lockMinutes: { min: 15, max: 24 * 60 },
} as const;

export type SecurityPolicySettings = Omit<TenantSecurityPolicy, 'organizationId' | 'updatedAt' | 'updatedByUserId'>;

// What a company without a policy row gets: the floor, with platform-default session lengths.
export const DEFAULT_SECURITY_POLICY: SecurityPolicySettings = Object.freeze({
  mfaScope: 'sensitive_roles',
  allowedFactors: ['passkey', 'totp'],
  sessionIdleMinutes: null,
  sessionAbsoluteMinutes: null,
  maxConcurrentSessions: null,
  passwordMinLength: TENANT_SECURITY_FLOOR.passwordMinLength,
  ipAllowlistDesk: [],
  ipAllowlistAdmin: [],
  ipAllowlistApi: [],
  ssoOnly: false,
  breakGlassUserIds: [],
  otpSignInChannels: [],
  maxFailedAttempts: TENANT_SECURITY_FLOOR.maxFailedAttempts.max,
  lockMinutes: TENANT_SECURITY_FLOOR.lockMinutes.min,
});

// Read on every staff request (IP allow-lists), so cached per process.
// ponytail: process-local 30 s TTL; another instance sees a policy change within 30 s. Move to a
// Redis pub/sub invalidation if that window ever matters.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { policy: SecurityPolicySettings; expiresAt: number }>();

export function toSecurityPolicySettings(row: TenantSecurityPolicy): SecurityPolicySettings {
  const { organizationId, updatedAt, updatedByUserId, ...settings } = row;
  return settings;
}

export async function loadTenantSecurityPolicy(tenantPrisma: TenantPrismaService, organizationId: string): Promise<SecurityPolicySettings> {
  const hit = cache.get(organizationId);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.policy;
  }
  const row = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
    tx.tenantSecurityPolicy.findUnique({ where: { organizationId } }),
  );
  const policy = row ? toSecurityPolicySettings(row) : DEFAULT_SECURITY_POLICY;
  cache.set(organizationId, { policy, expiresAt: Date.now() + CACHE_TTL_MS });
  return policy;
}

export function invalidateTenantSecurityPolicy(organizationId: string): void {
  cache.delete(organizationId);
}

// Refusal for a request from outside a tenant IP allow-list (YX-IAM-09). Organisation-level, so it
// says nothing about any account (and at sign-in it is given before credentials are checked).
export const NETWORK_NOT_ALLOWED_MESSAGE = 'Access to this organisation is not allowed from your network';

// desk = the staff app (every staff token request), admin = organisation administration
// endpoints (org:manage_* permissions), api = public API keys (YX-IAM-09).
export type IpAllowlistSurface = 'desk' | 'admin' | 'api';

// An empty list means "no restriction". A non-empty list fails closed on a missing/unparseable IP.
export function ipAllowedForSurface(policy: SecurityPolicySettings, surface: IpAllowlistSurface, ip: string | null | undefined): boolean {
  const list = surface === 'desk' ? policy.ipAllowlistDesk : surface === 'admin' ? policy.ipAllowlistAdmin : policy.ipAllowlistApi;
  return list.length === 0 || (typeof ip === 'string' && list.some((range) => isIpAllowed(ip, range)));
}

// Desk allow-list check for a staff token. Platform staff (super admin, incl. switch-in) are bound by
// Q7 staff controls, not a tenant's network list; everyone else -- impersonators included -- is.
export async function staffDeskIpAllowed(
  tenantPrisma: TenantPrismaService,
  claims: { organizationId: string | null; role: string; actingSuperAdmin?: boolean },
  ip: string | null | undefined,
): Promise<boolean> {
  if (!claims.organizationId || claims.role === 'super_admin' || claims.actingSuperAdmin) {
    return true;
  }
  return ipAllowedForSurface(await loadTenantSecurityPolicy(tenantPrisma, claims.organizationId), 'desk', ip);
}

// Session lifetime for a new session: the company's value when set, else the platform default,
// never beyond the floor, and idle never beyond absolute.
export function sessionLimitsFor(policy: SecurityPolicySettings): { idleSeconds: number; absoluteSeconds: number } {
  const base = staffSessionLimits();
  const absoluteSeconds = Math.min(
    policy.sessionAbsoluteMinutes != null ? policy.sessionAbsoluteMinutes * 60 : base.absoluteSeconds,
    SESSION_ABSOLUTE_MAX_SECONDS,
  );
  const idleSeconds = Math.min(
    policy.sessionIdleMinutes != null ? policy.sessionIdleMinutes * 60 : base.idleSeconds,
    SESSION_IDLE_MAX_SECONDS,
    absoluteSeconds,
  );
  return { idleSeconds, absoluteSeconds };
}
