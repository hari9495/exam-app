import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash, randomUUID } from 'crypto';
// argon2 above is retained deliberately: it still hashes PASSWORDS (lines 54,
// 112), which are the low-entropy input it exists for. Only refresh tokens moved
// to SHA-256 -- see refresh-token-hash.ts for why.
import {
  DEFAULT_SECURITY_POLICY,
  NETWORK_NOT_ALLOWED_MESSAGE,
  PrismaService,
  hashRefreshToken,
  ipAllowedForSurface,
  isLegacyArgon2Hash,
  loadTenantSecurityPolicy,
  refreshTokenMatches,
  revokeStaffSessions,
  staffDeskIpAllowed,
} from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { isOrganizationActive, ORGANIZATION_INACTIVE_MESSAGE } from '@exam-platform/shared';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ClientMeta, SessionUser, SessionsService } from './sessions.service';
import { LoginProtectionService, TooManyLoginAttemptsException } from './login-protection.service';
import { PasswordPolicyService } from './password-policy.service';
import { MfaService, MfaUser, PENDING_LOGIN_TTL_SECONDS, PendingLogin } from './mfa.service';
import { MfaLoginDto } from './dto/mfa.dto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Signed in, no second factor enrolled. `mfa` is set when MFA is required for this account:
// the client prompts enrolment, which becomes mandatory at `enrolmentDueAt` (YX-IAM-01, P12 §8).
export interface SignedIn extends TokenPair {
  mfa?: { required: true; enrolmentDueAt: Date };
}

// First factor accepted; the second is still owed (no session, no tokens yet).
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  factors: string[];
  expiresInSeconds: number;
}

export type LoginOutcome = SignedIn | MfaChallenge;
export const isMfaChallenge = (outcome: LoginOutcome): outcome is MfaChallenge => 'mfaRequired' in outcome;

const PASSWORD_RESET_EXPIRY_MINUTES = 15;

// Verified against when no account matched, so an unknown email costs the same argon2 work as
// a wrong password and response timing cannot enumerate accounts. Same default parameters as
// every real hash. Computed once, lazily.
let dummyPasswordHash: Promise<string> | undefined;
const getDummyPasswordHash = () => (dummyPasswordHash ??= argon2.hash(randomBytes(32).toString('hex')));

// How long after a refresh token is rotated out that presenting it is treated as a benign
// concurrent-refresh race rather than reuse of a stolen token.
//
// Why this exists: 119 `auth.token_reuse_detected` events across 18 ordinary staff users in
// 10 days, 72 of them within 10 seconds of another for the SAME user. That is not 119
// stolen tokens; it is two browser tabs each refreshing, the second arriving with the token
// the first had just rotated. Reuse detection then revoked the whole family and logged the
// user out of every tab. The single-tab client already collapses concurrent refreshes onto
// one in-flight promise; a useRef cannot reach across tabs, so the race is inherently
// cross-tab and has to be tolerated server-side.
//
// Why 10 seconds and not more: a stolen token replayed within the window yields only what
// the legitimate session already holds, and only once (the row stays revoked; the forgiven
// caller gets a fresh rotation, which itself rotates the current live token). Beyond the
// window, replay is treated exactly as before -- family revoked, incident audited.
const REFRESH_REUSE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly sessions: SessionsService,
    private readonly loginProtection: LoginProtectionService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly mfa: MfaService,
  ) {}

  // Password sign-in (YX-IAM-06/07/10). Unknown organisation, unknown email and wrong password
  // are indistinguishable to the caller -- same 401, same argon2 cost, same lockout counters --
  // and every attempt, including blocked ones, lands in login_events.
  async login(dto: LoginDto, meta: ClientMeta): Promise<LoginOutcome> {
    const identifier = dto.email.trim().toLowerCase();
    const orgSlug = dto.organizationSlug?.trim().toLowerCase() ?? '';
    const attempt = { identifier, method: 'password' as const, meta };

    const org = dto.organizationSlug ? await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } }) : null;

    const block = await this.loginProtection.check(orgSlug, identifier, meta.ip);
    if (block) {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId: org?.id ?? null, result: 'locked', reason: `${block.scope}_locked` });
      throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    }

    let organizationId: string | null = null;
    let policy = DEFAULT_SECURITY_POLICY;
    if (dto.organizationSlug) {
      if (!org) {
        await argon2.verify(await getDummyPasswordHash(), dto.password);
        return this.rejectLogin(orgSlug, attempt, null, null, 'unknown_organization');
      }
      if (!isOrganizationActive(org.status)) {
        await this.sessions.recordLoginEvent({ ...attempt, organizationId: org.id, result: 'failed', reason: 'organization_inactive' });
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
      organizationId = org.id;
      policy = await loadTenantSecurityPolicy(this.tenantPrisma, org.id);
      if (!ipAllowedForSurface(policy, 'desk', meta.ip)) {
        await this.sessions.recordLoginEvent({ ...attempt, organizationId, result: 'failed', reason: 'ip_not_allowed' });
        throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
      }
    }

    const isSuperAdminLookup = !dto.organizationSlug;
    const user = await this.tenantPrisma.forTenant(
      { organizationId, isSuperAdmin: isSuperAdminLookup },
      (tx) =>
        tx.user.findFirst({
          where: isSuperAdminLookup
            ? { email: dto.email, role: 'super_admin', organizationId: null }
            : { email: dto.email, organizationId },
        }),
    );

    const passwordOk = await argon2.verify(user?.passwordHash ?? (await getDummyPasswordHash()), dto.password);
    if (!user || !passwordOk) {
      return this.rejectLogin(orgSlug, attempt, organizationId, user, user ? 'bad_password' : 'unknown_user');
    }

    // SSO-only (YX-IAM-04): password sign-in is off except for the named break-glass accounts. A
    // correct password from anyone else gets exactly the wrong-password response, so the switch
    // is no password oracle.
    const breakGlass = policy.ssoOnly && policy.breakGlassUserIds.includes(user.id);
    if (policy.ssoOnly && !breakGlass) {
      return this.rejectLogin(orgSlug, attempt, organizationId, user, 'sso_only');
    }

    if (user.status !== 'active') {
      await this.sessions.recordLoginEvent({ ...attempt, organizationId, userId: user.id, result: 'failed', reason: 'account_inactive' });
      throw new UnauthorizedException('This account has been deactivated');
    }

    // The password is proven: re-check one whose breach check could not run when it was set.
    if (user.passwordRecheckPending) {
      void this.passwordPolicy.recheckAfterLogin(user, dto.password);
    }

    // Second factor (YX-IAM-01/03): anyone with one enrolled must use it. Break-glass sign-in is
    // only for accounts with MFA (YX-IAM-04); without it, the same wrong-password response.
    const login = { method: 'password' as const, orgSlug, identifier, breakGlass };
    const hasFactor = await this.mfa.hasFactor(user);
    if (breakGlass && !hasFactor) {
      return this.rejectLogin(orgSlug, attempt, organizationId, user, 'break_glass_without_mfa');
    }
    return hasFactor ? this.challengeSecondFactor(user.id, login, meta) : this.finishSignIn(user, login, meta);
  }

  // Everything after the last factor: lockout cleared, session + tokens, audit, alerts.
  private async finishSignIn(
    user: SessionUser & { permissionProfileId?: string | null },
    login: Pick<PendingLogin, 'method' | 'orgSlug' | 'identifier' | 'breakGlass'>,
    meta: ClientMeta,
    mfaFactor?: string,
  ): Promise<SignedIn> {
    if (login.method === 'password') {
      await this.loginProtection.registerSuccess(login.orgSlug, login.identifier, meta.ip);
    }
    const reason = login.breakGlass ? 'break_glass' : mfaFactor ? `mfa_${mfaFactor}` : undefined;
    const tokens: SignedIn = await this.startSession(user, login.method, meta, login.identifier, reason, mfaFactor);
    if (login.method === 'password') {
      await this.audit.record(
        { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' },
        {
          actorUserId: user.id,
          action: login.breakGlass ? 'login.break_glass' : 'login.success',
          entityType: 'user',
          entityId: user.id,
          ...(mfaFactor ? { metadata: { mfa: mfaFactor } } : {}),
        },
      );
    }
    if (login.breakGlass) {
      this.sessions.notifyBreakGlass(user, meta);
    }
    if (!mfaFactor) {
      const account = await this.mfa.loadUser(user.id);
      if (account && (await this.mfa.mfaRequiredFor(account))) {
        tokens.mfa = { required: true, enrolmentDueAt: account.mfaEnrolmentDueAt };
      }
    }
    return tokens;
  }

  private async challengeSecondFactor(
    userId: string,
    login: Pick<PendingLogin, 'method' | 'orgSlug' | 'identifier' | 'breakGlass'>,
    meta: ClientMeta,
  ): Promise<MfaChallenge> {
    const account = (await this.mfa.loadUser(userId))!;
    const factors = [...new Set((await this.mfa.activeFactors(account)).map((f) => f.type)), 'recovery_code'];
    const mfaToken = await this.mfa.createPendingLogin({
      ...login,
      userId,
      deviceIdHash: createHash('sha256').update(meta.deviceId).digest('hex'),
    });
    return { mfaRequired: true, mfaToken, factors, expiresInSeconds: PENDING_LOGIN_TTL_SECONDS };
  }

  // Passkey challenge for the second step of a pending sign-in (same device only).
  async mfaLoginPasskeyOptions(mfaToken: string, meta: ClientMeta) {
    const pending = await this.mfa.loadPendingLogin(mfaToken, meta.deviceId);
    const user = pending && (await this.mfa.loadUser(pending.userId));
    if (!pending || !user) {
      throw new UnauthorizedException('Your sign-in has expired. Please sign in again.');
    }
    return this.mfa.loginPasskeyOptions(mfaToken, user);
  }

  // Second step of sign-in (YX-IAM-01/03). Guessing is bounded by the same per-account and per-IP
  // lockout as passwords (keyed on the account id), and every failure is a login event.
  async completeMfaLogin(dto: MfaLoginDto, meta: ClientMeta): Promise<SignedIn> {
    const pending = await this.mfa.loadPendingLogin(dto.mfaToken, meta.deviceId);
    const user = pending && (await this.mfa.loadUser(pending.userId));
    if (!pending || !user) {
      await this.sessions.recordLoginEvent({ organizationId: null, result: 'mfa_failed', method: dto.factor, reason: 'mfa_token_invalid', meta });
      throw new UnauthorizedException('Your sign-in has expired. Please sign in again.');
    }
    const event = { organizationId: user.organizationId, userId: user.id, identifier: pending.identifier, meta };
    const block = await this.loginProtection.check('mfa', user.id, meta.ip);
    if (block) {
      await this.sessions.recordLoginEvent({ ...event, result: 'locked', method: dto.factor, reason: `mfa_${block.scope}_locked` });
      throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    }
    if (user.status !== 'active') {
      await this.sessions.recordLoginEvent({ ...event, result: 'failed', method: pending.method, reason: 'account_inactive' });
      throw new UnauthorizedException('This account has been deactivated');
    }
    if (!(await staffDeskIpAllowed(this.tenantPrisma, user, meta.ip))) {
      await this.sessions.recordLoginEvent({ ...event, result: 'failed', method: pending.method, reason: 'ip_not_allowed' });
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }

    const challenge = dto.factor === 'passkey' ? await this.mfa.takeLoginChallenge(dto.mfaToken) : null;
    const factor = await this.mfa.verifyProof(user, dto, challenge);
    if (!factor || !(await this.mfa.consumePendingLogin(dto.mfaToken))) {
      const { locked } = await this.loginProtection.registerFailure('mfa', user.id, meta.ip);
      await this.sessions.recordLoginEvent({
        ...event,
        result: 'mfa_failed',
        method: dto.factor,
        reason: locked ? 'mfa_invalid+lockout_started' : 'mfa_invalid',
      });
      if (locked) this.sessions.notifyLocked(user, meta);
      throw new UnauthorizedException('That verification did not work. Try again.');
    }
    await this.loginProtection.registerSuccess('mfa', user.id, meta.ip);
    return this.finishSignIn(user, pending, meta, factor);
  }

  private async rejectLogin(
    orgSlug: string,
    attempt: { identifier: string; method: 'password'; meta: ClientMeta },
    organizationId: string | null,
    user: SessionUser | null,
    reason: string,
  ): Promise<never> {
    const { locked } = await this.loginProtection.registerFailure(orgSlug, attempt.identifier, attempt.meta.ip);
    await this.sessions.recordLoginEvent({
      ...attempt,
      organizationId,
      userId: user?.id ?? null,
      result: 'failed',
      reason: locked ? `${reason}+lockout_started` : reason,
    });
    if (locked && user) {
      this.sessions.notifyLocked(user, attempt.meta);
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  // Session + token pair + login history + new-device alert, for every successful sign-in path.
  private async startSession(
    user: SessionUser & { permissionProfileId?: string | null },
    method: 'password' | 'saml',
    meta: ClientMeta,
    identifier: string,
    reason?: string,
    mfaFactor?: string,
  ): Promise<TokenPair> {
    const session = await this.sessions.create(user, method, meta, mfaFactor);
    const tokens = await this.issueTokenPair(user.id, user.organizationId, user.role, user.permissionProfileId ?? null, session);
    await this.recordLogin(user.id, user.organizationId, user.role);
    await this.sessions.recordLoginEvent({
      organizationId: user.organizationId,
      userId: user.id,
      identifier,
      result: 'success',
      method,
      reason,
      sessionId: session.id,
      newDevice: session.newDevice,
      meta,
    });
    if (session.newDevice) {
      this.sessions.notifyNewDevice(user, meta);
    }
    return tokens;
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
    if (!org) {
      return;
    }

    const user = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) =>
      tx.user.findFirst({ where: { email: dto.email, organizationId: org.id } }),
    );
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_EXPIRY_MINUTES);

    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    // Fire-and-forget, matching the invitation-email pattern in InvitationsService:
    // email delivery is a notification side effect, not something the caller should
    // wait on (or that should make forgotPassword() throw on SMTP failure).
    this.dispatchResetEmail(user.email, rawToken, org.id).catch((error) =>
      this.logger.error(`Failed to dispatch password reset email to ${user.email}`, error as Error),
    );
  }

  private async dispatchResetEmail(email: string, rawToken: string, organizationId: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Reset your password',
      html: `<p>Click the link below to reset your password. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
      organizationId,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const owner = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUnique({ where: { id: resetToken.userId }, select: { organizationId: true, role: true } }),
    );
    // Before the token is consumed: a rejected password leaves the link usable for another try.
    const { passwordHash, passwordRecheckPending } = await this.passwordPolicy.hashNewPassword(
      dto.newPassword,
      owner?.organizationId ?? null,
    );

    // Routed through forTenant (super_admin bypass): the caller has proven identity via
    // a validated reset token, not via an org-scoped session, so there is no tenant
    // context to set otherwise -- and without one, RLS's secure-by-default predicate
    // silently matches zero rows on `users`, making tx.user.update() a no-op. Same
    // pattern as the reuse-detection branch in refresh() below.
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash, passwordRecheckPending } });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await revokeStaffSessions(tx, { userId: resetToken.userId }, 'password_reset');
    });

    await this.audit.record(
      { organizationId: owner?.organizationId ?? null, isSuperAdmin: owner?.role === 'super_admin' },
      { actorUserId: resetToken.userId, action: 'password.reset', entityType: 'user', entityId: resetToken.userId },
    );
  }

  async refresh(refreshToken: string, ip: string | null = null): Promise<TokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // The family is the session (sessions.id). A revoked / expired / idle session -- or a
    // pre-sessions token whose family never had one -- ends here: retire whatever is left of the
    // family and make the client sign in again. Not reuse, so no reuse audit entry.
    const session = await this.sessions.findLive(payload.familyId, payload.sub);
    if (!session) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session expired');
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // A row written under the previous argon2 scheme can never match a SHA-256
    // digest. Retire it as an ordinary expired session rather than letting it
    // fall into the reuse branch below, which revokes the family AND writes an
    // auth.token_reuse_detected audit entry -- a security event meaning a
    // possibly-stolen token. Every session predating the cutover would have
    // produced one, poisoning the audit trail with false positives.
    if (stored && isLegacyArgon2Hash(stored.tokenHash)) {
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!stored || !refreshTokenMatches(stored.tokenHash, refreshToken)) {
      // Before calling it reuse: was THIS token rotated out only moments ago, AND is there a
      // live successor in the family? That combination is the concurrent-refresh race -- see
      // REFRESH_REUSE_GRACE_MS -- and only that combination.
      //
      // `stored` (a live row) is REQUIRED. The benign race always has one: the other tab's
      // rotation produced it. A logout, a password reset, or a prior reuse detection leave
      // ZERO live rows in the family, and forgiving there would let a copied token resurrect
      // a session the user had deliberately killed, for up to 10s. Security review caught
      // exactly that before this shipped.
      //
      // The hash is matched in the WHERE clause, not by ordering: with three tabs racing, the
      // most-recently-revoked row is not necessarily the one this caller holds, and an
      // orderBy+findFirst would wrongly reject the third tab. sha256 is deterministic, so an
      // exact match is available. Legacy argon2 rows can never equal a sha256 digest, so
      // they are excluded by construction.
      const justRotated = stored
        ? await this.prisma.refreshToken.findFirst({
            where: {
              userId: payload.sub,
              familyId: payload.familyId,
              tokenHash: hashRefreshToken(refreshToken),
              revokedAt: { gte: new Date(Date.now() - REFRESH_REUSE_GRACE_MS) },
            },
          })
        : null;
      if (justRotated) {
        // Forgive: hand this caller a fresh rotation rather than replaying the other tab's
        // token (which cannot be recovered from its hash anyway). This DOES revoke the other
        // tab's live token -- it must, to keep the family single-live -- and that is fine:
        // the other tab adopts this one's result over the BroadcastChannel, or on its next
        // 401 goes through this same forgiveness path itself.
        this.logger.warn(`Refresh race forgiven for user ${payload.sub} (token rotated ${Date.now() - justRotated.revokedAt!.getTime()}ms ago)`);
        return this.issueAfterRefreshChecks(payload, stored, session, ip);
      }
      // Reuse of an already-rotated/unknown token: revoke the whole family. Only LIVE rows --
      // re-stamping already-revoked rows would move them back inside the grace window on every
      // failed retry, so a family under attack could never age out of forgiveness.
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // ...and the session it belongs to, so access tokens already issued from it die on their
      // next request instead of living out their 15 minutes (YX-IAM-06).
      await this.sessions.revokeById(payload.familyId, payload.sub, 'refresh_token_reuse');
      // The lookup below and the audit write both live inside this one try: the family
      // revocation above has already committed, so nothing security-critical is lost if
      // either fails, and a failure here -- whether the RLS-bypass transaction or the
      // audit write itself -- must not prevent the client from being told their session
      // was revoked. Surfacing a 500/503 here instead of the 401 below would leave them
      // retrying with the same compromised token.
      try {
        // Routed through forTenant (super_admin bypass), not the raw client: `users` is
        // RLS-protected and the raw client sets no session context, so a bare findUnique
        // would silently match zero rows for every user, always falling through to the
        // null branch below. Same pattern as resetPassword and this method's own success
        // path further down. findUnique (not OrThrow): a token whose user was actually
        // deleted is a real case that must still fall through to null below.
        const compromisedUser = await this.tenantPrisma.forTenant(
          { organizationId: null, isSuperAdmin: true },
          (tx) => tx.user.findUnique({ where: { id: payload.sub } }),
        );
        // When compromisedUser is null (the token's user no longer exists, e.g. deleted),
        // organizationId is also null. A null organizationId with isSuperAdmin: false is
        // unwritable under this table's RLS block predicate: NULL = NULL evaluates to
        // UNKNOWN in SQL, so the predicate rejects every such row, regardless of load.
        // Route this case through the super_admin bypass instead -- correct both
        // mechanically (it's the only way to write a null-org row) and semantically (a
        // token attributable to no known user isn't attributable to any tenant either).
        const isSuperAdmin = compromisedUser ? compromisedUser.role === 'super_admin' : true;
        await this.audit.record(
          { organizationId: compromisedUser?.organizationId ?? null, isSuperAdmin },
          { actorUserId: payload.sub, action: 'auth.token_reuse_detected', entityType: 'user', entityId: payload.sub },
        );
      } catch (error) {
        this.logger.error('Failed to record auth.token_reuse_detected audit entry', error as Error);
      }
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    return this.issueAfterRefreshChecks(payload, stored, session, ip);
  }

  // The tail of refresh(): revoke the presented live row, re-check the account and org are
  // still active, issue a new pair in the same family. Shared by the normal path and the
  // concurrent-refresh forgiveness path so the two cannot drift.
  private async issueAfterRefreshChecks(
    payload: { sub: string; familyId: string },
    stored: { id: string } | null,
    session: { id: string; absoluteExpiresAt: Date },
    ip: string | null,
  ): Promise<TokenPair> {
    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: payload.sub } }),
    );

    // Desk IP allow-list (YX-IAM-09) before rotating: the refresh token stays usable from an
    // allowed network instead of being burnt (and later mistaken for reuse).
    if (!(await staffDeskIpAllowed(this.tenantPrisma, user, ip))) {
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }

    if (stored) {
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    // A super admin has no organization to suspend. For everyone else, checking
    // only at login would let a suspended organization's staff keep rotating
    // tokens indefinitely, so the suspension would appear not to have applied.
    if (user.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
      if (!isOrganizationActive(org?.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
    }

    return this.issueTokenPair(user.id, user.organizationId, user.role, user.permissionProfileId ?? null, session);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, familyId: payload.familyId },
      data: { revokedAt: new Date() },
    });
    await this.sessions.revokeById(payload.familyId, payload.sub, 'logout');
  }

  async issueTokensForSso(
    user: SessionUser & { permissionProfileId: string | null },
    meta: ClientMeta,
  ): Promise<LoginOutcome> {
    if (!(await staffDeskIpAllowed(this.tenantPrisma, user, meta.ip))) {
      await this.sessions.recordLoginEvent({
        organizationId: user.organizationId,
        userId: user.id,
        identifier: user.email.toLowerCase(),
        result: 'failed',
        method: 'saml',
        reason: 'ip_not_allowed',
        meta,
      });
      throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
    }
    // The IdP's assertion is a first factor here; an enrolled YukthiX factor is still required.
    const login = { method: 'saml' as const, orgSlug: '', identifier: user.email.toLowerCase(), breakGlass: false };
    if (await this.mfa.hasFactor(user)) {
      return this.challengeSecondFactor(user.id, login, meta);
    }
    return this.finishSignIn(user, login, meta);
  }

  // Only called from the two real login entry points (password login, SSO exchange) --
  // deliberately not folded into issueTokenPair(), which refresh() also calls on every
  // silent token rotation. Bumping this on every refresh would turn "last login" into
  // "last active", a different (and less useful) signal than the one the column promises.
  private async recordLogin(userId: string, organizationId: string | null, role: string): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: role === 'super_admin' }, (tx) =>
      tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
    );
  }

  // The acting token rides on the super admin's own session (`sid`): revoking that session
  // kills it too.
  async switchIntoOrg(actorUserId: string, targetOrgId: string, sessionId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!org) {
      throw new NotFoundException(`Organization ${targetOrgId} not found`);
    }

    await this.audit.record(
      { organizationId: targetOrgId, isSuperAdmin: true },
      { actorUserId, action: 'super_admin.org_switch_in', entityType: 'organization', entityId: targetOrgId },
    );

    return this.signAccessToken({
      sub: actorUserId,
      organizationId: targetOrgId,
      role: 'super_admin',
      permissionProfileId: null,
      actingSuperAdmin: true,
      actingOrgName: org.name,
      actingOrgSlug: org.slug,
      sid: sessionId,
    });
  }

  async recordSwitchOut(actorUserId: string, exitedOrgId: string | null): Promise<void> {
    if (!exitedOrgId) {
      return;
    }
    await this.audit.record(
      { organizationId: exitedOrgId, isSuperAdmin: true },
      { actorUserId, action: 'super_admin.org_switch_out', entityType: 'organization', entityId: exitedOrgId },
    );
  }

  async impersonate(
    caller: { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string; sessionId: string },
    targetUserId: string,
  ): Promise<string> {
    if (caller.impersonatorUserId) {
      throw new BadRequestException('Already impersonating another user');
    }
    if (caller.userId === targetUserId) {
      throw new BadRequestException('You cannot impersonate yourself');
    }

    const isSuper = caller.role === 'super_admin';
    const lookupContext = { organizationId: isSuper ? null : caller.organizationId, isSuperAdmin: isSuper };
    const { target, callerRecord } = await this.tenantPrisma.forTenant(lookupContext, async (tx) => ({
      target: await tx.user.findUnique({ where: { id: targetUserId } }),
      callerRecord: await tx.user.findUnique({ where: { id: caller.userId } }),
    }));

    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.status !== 'active') {
      throw new BadRequestException('Cannot impersonate a deactivated user');
    }
    if (isSuper) {
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot impersonate another platform administrator');
      }
    } else if (caller.role === 'org_admin') {
      const inOrg = target.organizationId === caller.organizationId;
      const impersonatable = target.role === 'recruiter' || target.role === 'panel' || target.role === 'hiring_manager';
      if (!inOrg || !impersonatable) {
        throw new ForbiddenException('You can only impersonate recruiter, hiring manager, or panel users in your own organization');
      }
    } else {
      throw new ForbiddenException('You are not allowed to impersonate users');
    }

    await this.audit.record(
      { organizationId: target.organizationId, isSuperAdmin: isSuper },
      { actorUserId: caller.userId, action: 'user.impersonate_start', entityType: 'user', entityId: target.id },
    );

    return this.signAccessToken({
      sub: target.id,
      organizationId: target.organizationId,
      role: target.role,
      permissionProfileId: null,
      impersonatorUserId: caller.userId,
      impersonatorEmail: callerRecord?.email ?? undefined,
      // The impersonator's session, not the target's: JwtStrategy checks it against
      // impersonatorUserId, and ending the impersonator's session ends the impersonation.
      sid: caller.sessionId,
    });
  }

  async recordImpersonationStop(impersonatorUserId: string, targetUserId: string): Promise<void> {
    // Look up the target's org so the stop event lands in the same audit scope as the
    // start event (filed under target.organizationId in impersonate() above). Routed
    // through forTenant's super_admin bypass since this method only receives user ids,
    // not a tenant context to query users with.
    const target = await this.tenantPrisma.forTenant(
      { organizationId: null, isSuperAdmin: true },
      (tx) => tx.user.findUnique({ where: { id: targetUserId }, select: { organizationId: true } }),
    );
    await this.audit.record(
      { organizationId: target?.organizationId ?? null, isSuperAdmin: true },
      { actorUserId: impersonatorUserId, action: 'user.impersonate_stop', entityType: 'user', entityId: targetUserId },
    );
  }

  private signAccessToken(payload: {
    sub: string;
    organizationId: string | null;
    role: string;
    permissionProfileId: string | null;
    actingSuperAdmin?: boolean;
    actingOrgName?: string;
    actingOrgSlug?: string;
    impersonatorUserId?: string;
    impersonatorEmail?: string;
    sid: string;
  }): string {
    return this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: `${process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900}s` as `${number}s`,
    });
  }

  // The refresh family is the session, and the refresh token dies with the session's absolute
  // limit (never the old 30 days).
  private async issueTokenPair(
    userId: string,
    organizationId: string | null,
    role: string,
    permissionProfileId: string | null,
    session: { id: string; absoluteExpiresAt: Date },
  ): Promise<TokenPair> {
    const familyId = session.id;
    const accessToken = this.signAccessToken({ sub: userId, organizationId, role, permissionProfileId, sid: session.id });
    const refreshTtlSeconds = Math.max(1, Math.ceil((session.absoluteExpiresAt.getTime() - Date.now()) / 1000));
    const refreshToken = this.jwt.sign(
      { sub: userId, familyId },
      // jwtid: two rotations inside the same second must still yield distinct tokens (and hashes).
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${refreshTtlSeconds}s` as `${number}s`, jwtid: randomUUID() },
    );
    const tokenHash = hashRefreshToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt: session.absoluteExpiresAt },
    });

    return { accessToken, refreshToken };
  }
}
