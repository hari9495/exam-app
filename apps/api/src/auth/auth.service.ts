import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash, randomUUID } from 'crypto';
// argon2 above is retained deliberately: it still hashes PASSWORDS (lines 54,
// 112), which are the low-entropy input it exists for. Only refresh tokens moved
// to SHA-256 -- see refresh-token-hash.ts for why.
import { PrismaService, hashRefreshToken, isLegacyArgon2Hash, refreshTokenMatches } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { isOrganizationActive, ORGANIZATION_INACTIVE_MESSAGE } from '@exam-platform/shared';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const PASSWORD_RESET_EXPIRY_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    let organizationId: string | null = null;

    if (dto.organizationSlug) {
      const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
      if (!org) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (!isOrganizationActive(org.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
      organizationId = org.id;
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

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const tokens = await this.issueTokenPair(user.id, user.organizationId, user.role);
    await this.audit.record(
      { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' },
      { actorUserId: user.id, action: 'login.success', entityType: 'user', entityId: user.id },
    );
    await this.recordLogin(user.id, user.organizationId, user.role);
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

    const passwordHash = await argon2.hash(dto.newPassword);

    // Routed through forTenant (super_admin bypass): the caller has proven identity via
    // a validated reset token, not via an org-scoped session, so there is no tenant
    // context to set otherwise -- and without one, RLS's secure-by-default predicate
    // silently matches zero rows on `users`, making tx.user.update() a no-op. Same
    // pattern as the reuse-detection branch in refresh() below.
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUnique({ where: { id: resetToken.userId } }),
    );
    await this.audit.record(
      { organizationId: user?.organizationId ?? null, isSuperAdmin: user?.role === 'super_admin' },
      { actorUserId: resetToken.userId, action: 'password.reset', entityType: 'user', entityId: resetToken.userId },
    );
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
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
      // Reuse of an already-rotated/unknown token: revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId },
        data: { revokedAt: new Date() },
      });
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

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: payload.sub } }),
    );

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

    return this.issueTokenPair(user.id, user.organizationId, user.role, payload.familyId);
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
  }

  async issueTokensForSso(userId: string, organizationId: string | null, role: string): Promise<TokenPair> {
    const tokens = await this.issueTokenPair(userId, organizationId, role);
    await this.recordLogin(userId, organizationId, role);
    return tokens;
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

  async switchIntoOrg(actorUserId: string, targetOrgId: string): Promise<string> {
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
      actingSuperAdmin: true,
      actingOrgName: org.name,
      actingOrgSlug: org.slug,
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
    caller: { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string },
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
      const impersonatable = target.role === 'recruiter' || target.role === 'panel';
      if (!inOrg || !impersonatable) {
        throw new ForbiddenException('You can only impersonate recruiter or panel users in your own organization');
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
      impersonatorUserId: caller.userId,
      impersonatorEmail: callerRecord?.email ?? undefined,
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
    actingSuperAdmin?: boolean;
    actingOrgName?: string;
    actingOrgSlug?: string;
    impersonatorUserId?: string;
    impersonatorEmail?: string;
  }): string {
    return this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: `${process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900}s` as `${number}s`,
    });
  }

  private async issueTokenPair(
    userId: string,
    organizationId: string | null,
    role: string,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const accessToken = this.signAccessToken({ sub: userId, organizationId, role });
    const refreshToken = this.jwt.sign(
      { sub: userId, familyId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS ?? 30}d` as `${number}d` },
    );
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
