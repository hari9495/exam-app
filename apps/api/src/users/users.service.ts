import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '@exam-platform/shared';
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../email/email.service';
import { SuperAdminEmailDto } from './dto/super-admin-email.dto';
import { BulkCreateUsersDto } from './dto/bulk-create-users.dto';
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';

/**
 * A User record with `passwordHash` (and any other sensitive fields) excluded.
 * This is the only shape UsersService should ever return to callers, since
 * UsersController serializes the return value directly into the HTTP response.
 */
export type SafeUser = Omit<User, 'passwordHash'>;

const SAFE_USER_SELECT = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const SUPER_ADMIN_SELECT = { id: true, email: true, createdAt: true } as const;

export type SuperAdminRecord = Pick<User, 'id' | 'email' | 'createdAt'>;

// Mirrors OrganizationsService's PASSWORD_RESET_EXPIRY_MINUTES (apps/api/src/organizations/organizations.service.ts)
// -- same policy, reused verbatim rather than shared cross-module, matching this codebase's existing pattern
// of each service owning its own small local constants.
const PASSWORD_RESET_EXPIRY_MINUTES = 15;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async create(context: TenantContext, dto: CreateUserDto): Promise<SafeUser> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be created within an organization');
    }

    const user = await this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: context.organizationId as string },
        select: { samlEnabled: true },
      });
      // SSO-enabled orgs authenticate staff via SAML, matched by email (see
      // AuthService's ssoExchange) -- passwordHash is never checked for these users, so
      // a caller-supplied password would just be dead weight nobody can use. Force a
      // random, unusable one instead of trusting/requiring the frontend to send one.
      const password = org?.samlEnabled ? randomBytes(32).toString('hex') : dto.password;
      if (!password) {
        throw new BadRequestException('Password is required');
      }
      const passwordHash = await argon2.hash(password);
      return tx.user.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
        select: SAFE_USER_SELECT,
      });
    });
    await this.audit.record(context, {
      actorUserId: null,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
    });
    return user;
  }

  async list(context: TenantContext, filters: { page?: string; pageSize?: string; search?: string } = {}): Promise<PaginatedResponse<SafeUser>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId,
        ...(filters.search ? { email: { contains: filters.search } } : {}),
      };
      const [users, total] = await Promise.all([
        tx.user.findMany({ where, select: SAFE_USER_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
        tx.user.count({ where }),
      ]);
      return buildPaginatedResponse(users, total, page, pageSize);
    });
  }

  async listDirectory(
    context: TenantContext,
    filters: { page?: string; pageSize?: string; search?: string } = {},
  ): Promise<PaginatedResponse<SafeUser & { organizationName: string | null }>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = filters.search ? { email: { contains: filters.search } } : {};
      const [users, total] = await Promise.all([
        tx.user.findMany({
          where,
          select: { ...SAFE_USER_SELECT, organization: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        tx.user.count({ where }),
      ]);
      const data = users.map(({ organization, ...user }) => ({
        ...user,
        organizationName: organization?.name ?? null,
      }));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
  }

  async getMe(context: TenantContext, userId: string): Promise<SafeUser> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: SAFE_USER_SELECT }),
    );
  }

  async updateMe(context: TenantContext, userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.update({ where: { id: userId }, data: { name: dto.name }, select: SAFE_USER_SELECT }),
    );
  }

  async update(context: TenantContext, targetUserId: string, dto: UpdateUserDto, actorUserId: string): Promise<SafeUser> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be updated within an organization');
    }
    if (dto.role === 'super_admin') {
      throw new ForbiddenException('Cannot assign the super_admin role here');
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.user.findFirst({ where: { id: targetUserId, organizationId: context.organizationId } });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot modify a platform administrator');
      }
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
        },
        select: SAFE_USER_SELECT,
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'user.updated',
        entityType: 'user',
        entityId: targetUserId,
      });
      return updated;
    });
  }

  async setStatus(
    context: TenantContext,
    targetUserId: string,
    status: 'active' | 'deactivated',
    actorUserId: string,
  ): Promise<SafeUser> {
    if (targetUserId === actorUserId) {
      throw new ForbiddenException('You cannot change your own active status');
    }
    if (!context.organizationId) {
      throw new BadRequestException('A user must be updated within an organization');
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.user.findFirst({ where: { id: targetUserId, organizationId: context.organizationId } });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot change a platform administrator');
      }
      const updated = await tx.user.update({ where: { id: targetUserId }, data: { status }, select: SAFE_USER_SELECT });
      if (status === 'deactivated') {
        await tx.refreshToken.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record(context, {
        actorUserId,
        action: status === 'deactivated' ? 'user.deactivated' : 'user.reactivated',
        entityType: 'user',
        entityId: targetUserId,
      });
      return updated;
    });
  }

  async changePassword(
    context: TenantContext,
    userId: string,
    dto: ChangePasswordDto,
    currentRefreshToken: string | undefined,
  ): Promise<void> {
    const user = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId } }),
    );

    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    // Preserve the session making this request: decode its own refresh-token
    // family so the revoke-others write below can exclude it. A voluntary
    // in-session password change shouldn't log the requester out, unlike the
    // forgot-password reset flow (which has no "current session" to keep).
    let currentFamilyId: string | null = null;
    if (currentRefreshToken) {
      try {
        const payload = this.jwt.verify<{ sub: string; familyId: string }>(currentRefreshToken, {
          secret: process.env.JWT_REFRESH_SECRET,
        });
        currentFamilyId = payload.familyId;
      } catch {
        currentFamilyId = null;
      }
    }

    await this.tenantPrisma.forTenant(context, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentFamilyId ? { familyId: { not: currentFamilyId } } : {}),
        },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record(context, {
      actorUserId: userId,
      action: 'password.changed',
      entityType: 'user',
      entityId: userId,
    });
  }

  async listSuperAdmins(
    context: TenantContext,
    filters: { page?: string; pageSize?: string; search?: string } = {},
  ): Promise<PaginatedResponse<SuperAdminRecord>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = { role: 'super_admin' as const, ...(filters.search ? { email: { contains: filters.search } } : {}) };
      const [superAdmins, total] = await Promise.all([
        tx.user.findMany({ where, select: SUPER_ADMIN_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
        tx.user.count({ where }),
      ]);
      return buildPaginatedResponse(superAdmins, total, page, pageSize);
    });
  }

  async inviteSuperAdmin(context: TenantContext, actorUserId: string, dto: SuperAdminEmailDto): Promise<SuperAdminRecord> {
    const existing = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findFirst({ where: { organizationId: null, email: dto.email } }),
    );
    if (existing) {
      throw new ConflictException(`A platform account for "${dto.email}" already exists`);
    }

    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const newAdmin = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.create({
        data: { organizationId: null, email: dto.email, passwordHash, role: 'super_admin' },
        select: SUPER_ADMIN_SELECT,
      }),
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: newAdmin.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
        },
      }),
    );

    this.dispatchInviteEmail(dto.email, rawToken).catch((error) =>
      this.logger.error(`Failed to dispatch super_admin invite email to ${dto.email}`, error as Error),
    );

    await this.audit.record(context, {
      actorUserId,
      action: 'user.super_admin_invited',
      entityType: 'user',
      entityId: newAdmin.id,
    });
    return newAdmin;
  }

  async promoteSuperAdmin(context: TenantContext, actorUserId: string, dto: SuperAdminEmailDto): Promise<SuperAdminRecord> {
    // The (organizationId, email) unique index allows the same email string to exist under
    // multiple different orgs, so a plain findFirst could silently promote the wrong account.
    // findMany + an explicit ambiguity check makes that impossible instead of picking arbitrarily.
    const matches = await this.tenantPrisma.forTenant(context, (tx) => tx.user.findMany({ where: { email: dto.email } }));
    if (matches.length === 0) {
      throw new NotFoundException(`No user found with email "${dto.email}"`);
    }
    if (matches.length > 1) {
      throw new ConflictException(
        `"${dto.email}" matches ${matches.length} accounts across organizations; promotion requires a globally unique email`,
      );
    }
    const [user] = matches;
    if (user.role === 'super_admin') {
      throw new ConflictException(`"${dto.email}" is already a super_admin`);
    }

    const promoted = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { organizationId: null, role: 'super_admin' },
        select: SUPER_ADMIN_SELECT,
      }),
    );

    this.dispatchPromotionEmail(dto.email).catch((error) =>
      this.logger.error(`Failed to dispatch super_admin promotion email to ${dto.email}`, error as Error),
    );

    await this.audit.record(context, {
      actorUserId,
      action: 'user.super_admin_promoted',
      entityType: 'user',
      entityId: promoted.id,
    });
    return promoted;
  }

  async requestPasswordReset(context: TenantContext, targetUserId: string, actorUserId: string): Promise<{ success: true }> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be within an organization');
    }
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.user.findFirst({ where: { id: targetUserId, organizationId: context.organizationId } });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      const org = await tx.organization.findUnique({ where: { id: context.organizationId as string }, select: { samlEnabled: true } });
      // SSO-enabled orgs authenticate via SAML, matched by email -- a reset link is
      // meaningless there (see create/bulkCreate for the same reasoning), so skip the
      // token and the email rather than send a link nobody can use.
      if (org?.samlEnabled) {
        return;
      }
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await tx.passwordResetToken.create({
        data: { userId: target.id, tokenHash, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000) },
      });
      // dispatched below, outside the tenant transaction, fire-and-forget
      this.dispatchResetLink(target.email, rawToken, context.organizationId as string).catch((error) =>
        this.logger.error(`Failed to dispatch password reset email to ${target.email}`, error as Error),
      );
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'user.password_reset_requested',
      entityType: 'user',
      entityId: targetUserId,
    });
    return { success: true };
  }

  async bulkCreate(
    context: TenantContext,
    dto: BulkCreateUsersDto,
    actorUserId: string,
  ): Promise<{ created: SafeUser[]; skipped: { email: string; reason: string }[] }> {
    if (!context.organizationId) {
      throw new BadRequestException('Users must be created within an organization');
    }
    // Read once, not per email -- samlEnabled can't change mid-call, and each of the
    // (up to 200) emails already runs its own transaction below.
    const org = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.organization.findUnique({ where: { id: context.organizationId as string }, select: { samlEnabled: true } }),
    );
    const created: SafeUser[] = [];
    const skipped: { email: string; reason: string }[] = [];
    for (const email of dto.emails) {
      const outcome = await this.tenantPrisma.forTenant<
        { created: SafeUser } | { skipped: { email: string; reason: string } }
      >(context, async (tx) => {
        const existing = await tx.user.findFirst({ where: { email, organizationId: context.organizationId } });
        if (existing) {
          return { skipped: { email, reason: 'already exists' } };
        }
        const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
        const user = await tx.user.create({
          data: { organizationId: context.organizationId as string, email, passwordHash, role: dto.role },
          select: SAFE_USER_SELECT,
        });
        // SSO-enabled orgs authenticate staff via SAML, matched by email -- no set-password
        // link is ever needed, and sending one would promise an access path that doesn't
        // apply. Skip the token and the email entirely rather than send a dead link.
        if (!org?.samlEnabled) {
          const rawToken = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(rawToken).digest('hex');
          await tx.passwordResetToken.create({
            data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000) },
          });
          this.dispatchResetLink(email, rawToken, context.organizationId as string).catch((error) =>
            this.logger.error(`Failed to dispatch invite email to ${email}`, error as Error),
          );
        }
        return { created: user };
      });
      if ('created' in outcome) {
        created.push(outcome.created);
        await this.audit.record(context, { actorUserId, action: 'user.created', entityType: 'user', entityId: outcome.created.id });
      } else {
        skipped.push(outcome.skipped);
      }
    }
    return { created, skipped };
  }

  private async dispatchResetLink(email: string, rawToken: string, organizationId: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Reset your Examination Platform password',
      html: `<p>A password reset was requested for your account. Click the link below to set a new password. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
      organizationId,
    });
  }

  private async dispatchInviteEmail(email: string, rawToken: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Welcome — set up your platform administrator account',
      html: `<p>You've been invited as a platform administrator on the Examination Platform. Click the link below to set your password and get started. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  private async dispatchPromotionEmail(email: string): Promise<void> {
    await this.emailService.send({
      to: email,
      subject: 'Your account now has platform administrator access',
      html: `<p>Your account on the Examination Platform has been granted platform administrator access. No action is needed — sign in as usual with your existing password.</p>`,
    });
  }
}
