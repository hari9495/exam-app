import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import {
  AuditService,
  TenantContext,
  TenantPrismaService,
  authCookieSecure,
  DEFAULT_SECURITY_POLICY,
  isUuid,
  loadTenantSecurityPolicy,
  revokeStaffSessions,
  sessionLimitsFor,
} from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { buildPaginatedResponse, resolvePaginationParams } from '../common/paginated-response';
import { ANY_COMPANY, LoginProtectionService } from './login-protection.service';

// Who is signing in from where. `deviceId` is the raw value of the long-lived device cookie;
// only its sha256 is ever stored.
export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
  deviceId: string;
  // ISO country of the client IP, from the edge proxy's geo header (GEO_COUNTRY_HEADER), if any.
  country?: string | null;
}

// The country the trusted edge proxy (Cloudflare `cf-ipcountry`, Azure Front Door, ...) resolved for
// the client IP. Only set when GEO_COUNTRY_HEADER names the header; a direct client could forge it,
// so it must only be configured behind a proxy that overwrites it. Two letters or nothing.
export function clientCountry(req: Request): string | null {
  const header = process.env.GEO_COUNTRY_HEADER?.trim().toLowerCase();
  const value = header ? req.get(header)?.trim().toUpperCase() : undefined;
  return value && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1' ? value : null;
}

// Sign-in methods (saml / oidc: a company identity provider; google / microsoft: YukthiX's own "Continue with" apps; otp_*:
// one-time code by that channel); the MFA factors appear on second-factor failures (result mfa_failed); 'admin' is an admin
// clearing an account lock (result unlocked).
export const LOGIN_METHODS = ['password', 'saml', 'oidc', 'google', 'microsoft', 'otp_email', 'otp_sms', 'otp_whatsapp', 'totp', 'passkey', 'recovery_code', 'otp', 'admin'] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];
export type LoginResult = 'success' | 'failed' | 'locked' | 'mfa_failed' | 'code_sent' | 'unlocked';

export interface SessionUser {
  id: string;
  email: string;
  organizationId: string | null;
  role: string;
}

export const DEVICE_COOKIE = 'yx_device';
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // browsers cap cookie lifetime at 400 days
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

// Reads the caller's device cookie, minting (and setting) a fresh one when absent or malformed.
// HttpOnly + SameSite=Lax + Secure-by-default, same attributes as the refresh cookie.
export function resolveClientMeta(req: Request, res: Response): ClientMeta {
  let deviceId = req.cookies?.[DEVICE_COOKIE];
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    deviceId = randomBytes(32).toString('base64url');
    res.cookie(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: authCookieSecure(),
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
    });
  }
  const userAgent = req.get('user-agent');
  return { ip: req.ip ?? null, userAgent: userAgent ? userAgent.slice(0, 512) : null, deviceId, country: clientCountry(req) };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
const contextFor = (user: { organizationId: string | null; role: string }): TenantContext => ({
  organizationId: user.organizationId,
  isSuperAdmin: user.role === 'super_admin',
});

// What a session looks like to its owner / an admin. Never the device hash.
const SESSION_SELECT = {
  id: true,
  userId: true,
  method: true,
  assuranceLevel: true,
  userAgent: true,
  ipAddress: true,
  geo: true,
  createdAt: true,
  lastSeenAt: true,
  idleExpiresAt: true,
  absoluteExpiresAt: true,
} satisfies Prisma.SessionSelect;

const LOGIN_EVENT_SELECT = {
  id: true,
  userId: true,
  identifier: true,
  result: true,
  method: true,
  reason: true,
  ipAddress: true,
  userAgent: true,
  geo: true,
  newDevice: true,
  createdAt: true,
} satisfies Prisma.LoginEventSelect;

const liveWhere = (now = new Date()): Prisma.SessionWhereInput => ({
  revokedAt: null,
  absoluteExpiresAt: { gt: now },
  idleExpiresAt: { gt: now },
});

export interface LoginEventFilters {
  userId?: string;
  result?: string;
  method?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly loginProtection: LoginProtectionService,
  ) {}

  // Opens a session for a user who has just proven their identity. `newDevice` is true when the
  // user has signed in before but never from this device cookie (first-ever sign-in is not
  // "new device": there is nothing to compare against). Lifetime and the concurrent-session cap
  // follow the company's security policy within the floor (YX-IAM-06, Q8).
  // `mfaFactor`: the second factor proven at sign-in; the session then starts at AAL2.
  // `identityProviderId`: the IdP that signed it in (SSO), so disabling that IdP ends it.
  // `newCountry`: a known device, but a country this user has never signed in from.
  async create(
    user: SessionUser,
    method: LoginMethod,
    meta: ClientMeta,
    mfaFactor?: string,
    identityProviderId: string | null = null,
  ): Promise<{ id: string; absoluteExpiresAt: Date; newDevice: boolean; newCountry: boolean }> {
    const policy = user.organizationId ? await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId) : DEFAULT_SECURITY_POLICY;
    const { idleSeconds, absoluteSeconds } = sessionLimitsFor(policy);
    const now = Date.now();
    const deviceIdHash = sha256(meta.deviceId);
    const result = await this.tenantPrisma.forTenant(contextFor(user), async (tx) => {
      const seenDevice = await tx.session.findFirst({ where: { userId: user.id, deviceIdHash }, select: { id: true } });
      const seenAny = seenDevice ?? (await tx.session.findFirst({ where: { userId: user.id }, select: { id: true } }));
      const country = meta.country ?? null;
      // Compared only against sessions whose country is known, so turning the header on does not
      // alert everyone once.
      const [anyCountry, seenCountry] = country
        ? await Promise.all([
            tx.session.findFirst({ where: { userId: user.id, geo: { not: null } }, select: { id: true } }),
            tx.session.findFirst({ where: { userId: user.id, geo: country }, select: { id: true } }),
          ])
        : [null, null];
      const session = await tx.session.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          method,
          deviceIdHash,
          userAgent: meta.userAgent,
          ipAddress: meta.ip,
          geo: country,
          identityProviderId,
          idleTimeoutSeconds: idleSeconds,
          idleExpiresAt: new Date(now + idleSeconds * 1000),
          absoluteExpiresAt: new Date(now + absoluteSeconds * 1000),
          ...(mfaFactor ? { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(now), mfaMethod: mfaFactor } : {}),
        },
        select: { id: true, absoluteExpiresAt: true },
      });
      // Over the company's concurrent-session cap: the least recently used sessions make room.
      let evicted = 0;
      if (policy.maxConcurrentSessions) {
        const excess = await tx.session.findMany({
          where: { userId: user.id, id: { not: session.id }, ...liveWhere(new Date(now)) },
          orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
          skip: policy.maxConcurrentSessions - 1, // the new session holds one slot
          select: { id: true },
        });
        const ids = excess.map((s) => s.id);
        evicted = ids.length ? await revokeStaffSessions(tx, { id: { in: ids } }, 'concurrent_limit') : 0;
      }
      return { session: { ...session, newDevice: !seenDevice && Boolean(seenAny), newCountry: Boolean(anyCountry && !seenCountry) }, evicted };
    });
    if (result.evicted > 0) {
      await this.audit.record(contextFor(user), {
        actorUserId: user.id,
        action: 'session.revoked_concurrent_limit',
        entityType: 'user',
        entityId: user.id,
        metadata: { revoked: result.evicted, limit: policy.maxConcurrentSessions },
      });
    }
    return result.session;
  }

  // The live session behind a refresh token, or null (revoked, expired, idle, unknown, or a
  // pre-sessions token whose family has no session row). Super-admin context: the caller holds a
  // signed refresh token, not a tenant session -- same reasoning as touchStaffSession.
  async findLive(sessionId: string, userId: string): Promise<{ id: string; absoluteExpiresAt: Date } | null> {
    if (!isUuid(sessionId) || !isUuid(userId)) return null;
    return this.tenantPrisma.forTenant(SUPER, (tx) =>
      tx.session.findFirst({ where: { id: sessionId, userId, ...liveWhere() }, select: { id: true, absoluteExpiresAt: true } }),
    );
  }

  // Ends one session on behalf of its own holder (logout / refresh-token reuse).
  async revokeById(sessionId: string, userId: string, reason: string): Promise<void> {
    if (!isUuid(sessionId) || !isUuid(userId)) return;
    const session = await this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const row = await tx.session.findFirst({ where: { id: sessionId, userId, revokedAt: null }, select: { organizationId: true } });
      if (row) await revokeStaffSessions(tx, { id: sessionId }, reason);
      return row;
    });
    if (session) {
      await this.audit.record(
        { organizationId: session.organizationId, isSuperAdmin: session.organizationId === null },
        { actorUserId: userId, action: 'session.revoked', entityType: 'session', entityId: sessionId, metadata: { reason } },
      );
    }
  }

  // Append-only record of a sign-in attempt (YX-IAM-10). Written in the attempt's own tenant
  // scope; attempts that resolved to no tenant are platform rows (super-admin scope only).
  // Never throws: losing one history row must not turn a sign-in into a 500, but it is logged.
  async recordLoginEvent(input: {
    organizationId: string | null;
    userId?: string | null;
    identifier?: string | null;
    result: LoginResult;
    method: LoginMethod;
    reason?: string;
    sessionId?: string;
    newDevice?: boolean;
    meta: ClientMeta;
  }): Promise<void> {
    try {
      await this.tenantPrisma.forTenant(
        { organizationId: input.organizationId, isSuperAdmin: input.organizationId === null },
        (tx) =>
          tx.loginEvent.create({
            data: {
              organizationId: input.organizationId,
              userId: input.userId ?? null,
              identifier: input.identifier ? input.identifier.slice(0, 320) : null,
              result: input.result,
              method: input.method,
              reason: input.reason ?? null,
              sessionId: input.sessionId ?? null,
              ipAddress: input.meta.ip,
              userAgent: input.meta.userAgent,
              deviceIdHash: sha256(input.meta.deviceId),
              geo: input.meta.country ?? null,
              newDevice: input.newDevice ?? false,
            },
          }),
      );
    } catch (error) {
      this.logger.error(`Failed to record login event (${input.result}/${input.method})`, error as Error);
    }
  }

  // ---- the signed-in user's own sessions and history -------------------------------------

  async listMine(context: TenantContext, userId: string, currentSessionId: string | undefined) {
    const sessions = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.session.findMany({ where: { userId, ...liveWhere() }, select: SESSION_SELECT, orderBy: { lastSeenAt: 'desc' } }),
    );
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  async revokeMine(context: TenantContext, userId: string, sessionId: string): Promise<void> {
    const count = await this.tenantPrisma.forTenant(context, (tx) =>
      revokeStaffSessions(tx, { id: sessionId, userId }, 'user_revoked'),
    );
    if (count === 0) throw new NotFoundException('Session not found');
    await this.audit.record(context, {
      actorUserId: userId,
      action: 'session.revoked',
      entityType: 'session',
      entityId: sessionId,
      metadata: { reason: 'user_revoked' },
    });
  }

  async revokeMyOthers(context: TenantContext, userId: string, currentSessionId: string): Promise<{ revoked: number }> {
    const revoked = await this.tenantPrisma.forTenant(context, (tx) =>
      revokeStaffSessions(tx, { userId, id: { not: currentSessionId } }, 'user_revoked_others'),
    );
    await this.audit.record(context, {
      actorUserId: userId,
      action: 'session.revoked_others',
      entityType: 'user',
      entityId: userId,
      metadata: { revoked },
    });
    return { revoked };
  }

  async myLoginHistory(context: TenantContext, userId: string, filters: LoginEventFilters) {
    return this.listLoginEvents(context, { ...filters, userId });
  }

  // ---- tenant admin ------------------------------------------------------------------------

  // RLS already confines an org admin to their tenant. A super-admin context sees every tenant
  // by RLS, so when it is acting inside one tenant (switch-in) the filter pins that tenant too.
  private tenantWhere(context: TenantContext) {
    return context.organizationId ? { organizationId: context.organizationId } : {};
  }

  async adminListSessions(context: TenantContext, filters: { userId?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    const where: Prisma.SessionWhereInput = {
      ...this.tenantWhere(context),
      ...liveWhere(),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.session.findMany({
          where,
          select: { ...SESSION_SELECT, user: { select: { email: true, name: true, role: true } } },
          orderBy: { lastSeenAt: 'desc' },
          skip,
          take,
        }),
        tx.session.count({ where }),
      ]);
      return buildPaginatedResponse(rows, total, page, pageSize);
    });
  }

  async adminRevoke(context: TenantContext, actorUserId: string, sessionId: string): Promise<void> {
    const count = await this.tenantPrisma.forTenant(context, (tx) =>
      revokeStaffSessions(tx, { id: sessionId, ...this.tenantWhere(context) }, 'admin_revoked'),
    );
    if (count === 0) throw new NotFoundException('Session not found');
    await this.audit.record(context, {
      actorUserId,
      action: 'session.revoked',
      entityType: 'session',
      entityId: sessionId,
      metadata: { reason: 'admin_revoked' },
    });
  }

  // Admin "Unlock account" (YX-IAM-07): clears the person's account lock -- password and one-time
  // code sign-in (by email and by mobile number), the second step and step-up -- for someone in
  // the admin's own organisation only. Never the per-IP lock and never their MFA. Audited with the
  // reason, written to login activity, and the person is told.
  async unlockAccount(context: TenantContext, actorUserId: string, targetUserId: string, reason: string, meta: ClientMeta): Promise<{ wasLocked: boolean }> {
    const organizationId = context.organizationId;
    if (!organizationId) throw new BadRequestException('Open an organisation first');
    if (actorUserId === targetUserId) throw new ForbiddenException('You cannot unlock your own account. Ask another admin.');
    const target = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findFirst({
        where: { id: targetUserId, organizationId },
        select: { id: true, email: true, role: true, organizationId: true, mobileNumber: true, organization: { select: { slug: true } } },
      }),
    );
    if (!target?.organization) throw new NotFoundException('User not found');

    // The same (scope, identifier) pairs sign-in counts under (AuthService / MfaController).
    // Each identifier's own lock (W-016, ANY_COMPANY) too: an unlocked person can sign in without the company named.
    const slug = target.organization.slug.trim().toLowerCase();
    const accounts: [string, string][] = [
      ...[slug, ANY_COMPANY].flatMap((scope) => [
        [scope, target.email.trim().toLowerCase()] as [string, string],
        ...(target.mobileNumber ? [[scope, target.mobileNumber] as [string, string]] : []),
      ]),
      ['mfa', target.id],
      ['stepup', target.id],
    ];
    let wasLocked = false;
    for (const [scope, identifier] of accounts) {
      if (await this.loginProtection.clearAccount(scope, identifier)) wasLocked = true;
    }

    await this.audit.record(context, {
      actorUserId,
      action: 'account.unlocked',
      entityType: 'user',
      entityId: target.id,
      metadata: { reason, wasLocked },
    });
    await this.recordLoginEvent({ organizationId, userId: target.id, identifier: target.email, result: 'unlocked', method: 'admin', reason: 'admin_unlock', meta });
    this.notifySecurityChange(
      target,
      'Your YukthiX account was unlocked',
      'An administrator unlocked sign-in to your account after repeated failed attempts. Your password and two-step verification are unchanged.',
    );
    return { wasLocked };
  }

  async listLoginEvents(context: TenantContext, filters: LoginEventFilters) {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    const where: Prisma.LoginEventWhereInput = {
      ...this.tenantWhere(context),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.result ? { result: filters.result === 'unsuccessful' ? { notIn: ['success', 'unlocked'] } : filters.result } : {}),
      ...(filters.method ? { method: filters.method } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } }
        : {}),
    };
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.loginEvent.findMany({ where, select: LOGIN_EVENT_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
        tx.loginEvent.count({ where }),
      ]);
      return buildPaginatedResponse(rows, total, page, pageSize);
    });
  }

  // ---- notifications to the account holder (fire-and-forget) -----------------------------

  notifyNewDevice(user: SessionUser, meta: ClientMeta): void {
    this.send(
      user,
      'New sign-in to your YukthiX account',
      `<p>Your account was just signed in to from a device we have not seen before.</p>${this.describe(meta)}` +
        '<p>If this was you, no action is needed. If not, open <b>Me &rsaquo; Security</b>, sign out that session and change your password.</p>',
    );
  }

  // A known device, but a country this account has never signed in from (ASVS V2.2 / YX-IAM-07).
  notifyNewCountry(user: SessionUser, meta: ClientMeta): void {
    this.send(
      user,
      'Sign-in to your YukthiX account from a new country',
      `<p>Your account was just signed in to from a country it has not been used from before (${escapeHtml(meta.country ?? 'unknown')}).</p>${this.describe(meta)}` +
        '<p>If this was you, no action is needed. If not, open <b>Me &rsaquo; Security</b>, sign out that session and change your password.</p>',
    );
  }

  notifyLocked(user: SessionUser, meta: ClientMeta): void {
    this.send(
      user,
      'Sign-in to your YukthiX account was temporarily locked',
      `<p>We temporarily locked sign-in to your account after repeated failed password attempts.</p>${this.describe(meta)}` +
        '<p>You can try again later or reset your password. If these attempts were not you, reset your password now.</p>',
    );
  }

  // SSO-only break-glass sign-in (YX-IAM-04): every admin of the company is told.
  notifyBreakGlass(user: SessionUser, meta: ClientMeta): void {
    if (!user.organizationId) return;
    this.notifyAdmins(
      user.organizationId,
      'Break-glass sign-in to your YukthiX organisation',
      `<p>The break-glass account <b>${escapeHtml(user.email)}</b> just signed in with a password while SSO-only is on.</p>` +
        `${this.describe(meta)}<p>If this was not expected, review <b>Admin &rsaquo; Login activity</b> and revoke the session.</p>`,
    );
  }

  // Every active administrator of the company hears about it. `html` is already escaped.
  notifyAdmins(organizationId: string, subject: string, html: string): void {
    this.tenantPrisma
      .forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.user.findMany({ where: { organizationId, role: 'org_admin', status: 'active' }, select: { id: true, email: true } }),
      )
      .then((admins) => {
        for (const admin of admins) this.send({ ...admin, organizationId, role: 'org_admin' }, subject, html);
      })
      .catch((error) => this.logger.error(`Failed to alert the admins of organisation ${organizationId}`, error as Error));
  }

  // MFA changes and resets (YX-IAM-10/11): the people concerned hear about every one.
  // `what` is a complete sentence.
  notifySecurityChange(user: SessionUser, subject: string, what: string): void {
    this.send(
      user,
      subject,
      `<p>${escapeHtml(what)}</p><p>Time: ${escapeHtml(new Date().toISOString())}</p>` +
        '<p>If you did not expect this, contact your administrator at once.</p>',
    );
  }

  private describe(meta: ClientMeta): string {
    return (
      `<p>Time: ${escapeHtml(new Date().toISOString())}<br>IP address: ${escapeHtml(meta.ip ?? 'unknown')}` +
      `<br>Browser: ${escapeHtml(meta.userAgent ?? 'unknown')}</p>`
    );
  }

  private send(user: SessionUser, subject: string, html: string): void {
    this.email
      .send({ to: user.email, subject, html, organizationId: user.organizationId ?? undefined })
      .catch((error) => this.logger.error(`Failed to send security notification to user ${user.id}`, error as Error));
  }
}
