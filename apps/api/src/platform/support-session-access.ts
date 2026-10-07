import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';

// P02 Q8 / YX-SEC-20: what a YukthiX staff member may do inside a company. Used by sign-in (switching into a company
// needs a live, approved session of their own) and by JwtStrategy on every request made with that token.

/** An unanswered request lapses after a day (DECISION NEEDED: P02 sets no limit; the shortest sensible one). */
export const REQUEST_LAPSES_HOURS = 24;
export const MAX_SESSION_HOURS = 72;

/** The approved session in its window that `staffUserId` asked for in `organizationId`, or null. */
export async function liveSupportSession(tenantPrisma: TenantPrismaService, where: { organizationId: string; staffUserId: string; id?: string }) {
  const now = new Date();
  return tenantPrisma.forTenant({ organizationId: where.organizationId, isSuperAdmin: false }, (tx) =>
    tx.supportSession.findFirst({
      where: { ...(where.id ? { id: where.id } : {}), organizationId: where.organizationId, requestedBy: where.staffUserId, status: 'approved', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true, endsAt: true },
    }),
  );
}

// A support session is read-only: the staff member may look, never change (P02 Q8). Leaving the company and signing
// out are the only writes.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WRITES_ALLOWED = ['/auth/super-admin/switch-out', '/auth/logout'];

// Deny by default: only the YukthiX HR pages, whose services hide pay, identity, bank and restricted data from
// someone acting for another (P02 YX-SEC-20; step 2's actingForOther rules), plus what those pages need to load.
// DECISION NEEDED: the hiring and assessment (exam app) pages do not mask Confidential / Special data for staff, so
// support sessions do not reach them yet.
export const SUPPORT_READABLE = [
  '/org',
  '/people',
  '/access',
  '/support-access',
  '/security',
  '/notifications/sms',
  '/organizations/branding',
  '/users/me',
  '/rbac/me',
  '/auth/mfa',
  '/auth/sessions',
  '/auth/login-history',
];
const readable = (path: string) => SUPPORT_READABLE.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Called by JwtStrategy for a token minted inside a support session: refuses it once the session has ended,
 * expired or been ended by the company, refuses any change, and records the request in the company's audit log
 * (entity support_session, so the company sees the session's activity).
 */
export async function enforceSupportSession(tenantPrisma: TenantPrismaService, req: Request, token: { sub: string; organizationId: string | null; supportSessionId: string }): Promise<void> {
  const path = req.path.replace(/^\/api\/v1/, '');
  const method = req.method.toUpperCase();
  // Leaving always works, even after the window closed (switch-out records itself).
  if (method === 'POST' && WRITES_ALLOWED.includes(path)) return;
  const live = token.organizationId ? await liveSupportSession(tenantPrisma, { organizationId: token.organizationId, staffUserId: token.sub, id: token.supportSessionId }) : null;
  if (!live) throw new ForbiddenException({ statusCode: 403, code: 'SUPPORT_SESSION_ENDED', message: 'The support session has ended. Leave the company to continue.' });
  if (!READ_METHODS.has(method)) throw new ForbiddenException({ statusCode: 403, code: 'SUPPORT_SESSION_READ_ONLY', message: 'A support session is read-only.' });
  if (!readable(path)) throw new ForbiddenException({ statusCode: 403, code: 'SUPPORT_SESSION_OUT_OF_SCOPE', message: 'A support session covers the YukthiX HR pages only.' });
  if (method === 'OPTIONS') return;
  await new AuditService(tenantPrisma).record(
    { organizationId: token.organizationId, isSuperAdmin: true },
    { actorUserId: token.sub, action: 'support_session.request', entityType: 'support_session', entityId: token.supportSessionId, metadata: { method, path: path.slice(0, 300) } },
  );
}
