import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '@exam-platform/shared';

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

@Injectable()
export class UsersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
  ) {}

  async create(context: TenantContext, dto: CreateUserDto): Promise<SafeUser> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be created within an organization');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
        select: SAFE_USER_SELECT,
      }),
    );
    await this.audit.record(context, {
      actorUserId: null,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
    });
    return user;
  }

  async list(context: TenantContext): Promise<SafeUser[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findMany({
        where: { organizationId: context.organizationId },
        select: SAFE_USER_SELECT,
      }),
    );
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
}
