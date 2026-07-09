import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateUserDto } from './dto/create-user.dto';
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
}
