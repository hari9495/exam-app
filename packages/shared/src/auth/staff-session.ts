import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { SessionAssurance } from './mfa';

// Staff session lifetime (P12 Q8 / YX-IAM-06). The YukthiX floor is a ceiling on laxness:
// desk idle timeout at most 8 h (default 30 min), absolute lifetime at most 12 h. Env may only
// make these stricter; a laxer value is clamped to the floor rather than honoured.
// ponytail: process-wide limits; per-tenant stricter values arrive with tenant_security_policies.
export const SESSION_IDLE_DEFAULT_SECONDS = 30 * 60;
export const SESSION_IDLE_MAX_SECONDS = 8 * 60 * 60;
export const SESSION_ABSOLUTE_MAX_SECONDS = 12 * 60 * 60;
// last_seen_at is written at most once per this interval per session, so an active user costs
// one session UPDATE a minute, not one per request.
export const SESSION_TOUCH_INTERVAL_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

// Env value in `unit`s (60 = minutes, 3600 = hours); unset/invalid -> fallback, laxer -> max.
function envSeconds(name: string, unit: number, fallback: number, max: number): number {
  const seconds = Number(process.env[name]) * unit;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.floor(seconds), max) : fallback;
}

export function staffSessionLimits(): { idleSeconds: number; absoluteSeconds: number } {
  return {
    idleSeconds: envSeconds('SESSION_IDLE_TIMEOUT_MINUTES', 60, SESSION_IDLE_DEFAULT_SECONDS, SESSION_IDLE_MAX_SECONDS),
    absoluteSeconds: envSeconds('SESSION_ABSOLUTE_TIMEOUT_HOURS', 3600, SESSION_ABSOLUTE_MAX_SECONDS, SESSION_ABSOLUTE_MAX_SECONDS),
  };
}

// The per-request check behind every staff access token: is session `sessionId` still live for
// `userId` (not revoked, inside both idle and absolute limits)? Slides the idle window forward,
// throttled to SESSION_TOUCH_INTERVAL_SECONDS. One statement, primary-key lookups. Returns the
// session's assurance state (MFA, YX-IAM-01/02), or null when it is not live.
//
// Runs in the super-admin RLS context: the caller has proven identity with a signed token whose
// `sid` and `sub` are both pinned in the WHERE clause, and the session's tenant can differ from
// the token's acting tenant (super-admin switch-in, impersonation) -- the same "proven by a
// token, no tenant session yet" case AuthService.refresh() uses this context for.
export async function touchStaffSession(
  tenantPrisma: TenantPrismaService,
  sessionId: unknown,
  userId: unknown,
): Promise<SessionAssurance | null> {
  if (!isUuid(sessionId) || !isUuid(userId)) {
    return null;
  }
  const rows = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
    tx.$queryRaw<SessionAssurance[]>`
      WITH live AS (
        SELECT s.id, s.last_seen_at, s.assurance_level, s.mfa_verified_at, s.mfa_method, u.mfa_enrolment_due_at
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ${sessionId}::uuid AND s.user_id = ${userId}::uuid AND s.revoked_at IS NULL
          AND s.absolute_expires_at > now() AND s.idle_expires_at > now()
      ), bumped AS (
        UPDATE sessions s
        SET last_seen_at = now(),
            idle_expires_at = LEAST(now() + make_interval(secs => s.idle_timeout_seconds), s.absolute_expires_at)
        FROM live
        WHERE s.id = live.id AND live.last_seen_at < now() - make_interval(secs => ${SESSION_TOUCH_INTERVAL_SECONDS})
        RETURNING s.id
      )
      SELECT assurance_level AS "assuranceLevel", mfa_verified_at AS "mfaVerifiedAt", mfa_method AS "mfaMethod",
             mfa_enrolment_due_at AS "mfaEnrolmentDueAt"
      FROM live`,
  );
  return rows[0] ?? null;
}

// Revokes every live session matching `where` inside the caller's transaction (and therefore its
// RLS scope). A revoked session rejects its access tokens on the next request and its refresh
// tokens on the next rotation. Returns how many sessions were revoked.
export async function revokeStaffSessions(
  tx: Prisma.TransactionClient,
  where: Prisma.SessionWhereInput,
  reason: string,
): Promise<number> {
  const { count } = await tx.session.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return count;
}
