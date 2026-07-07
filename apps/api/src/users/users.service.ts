import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateUserDto } from './dto/create-user.dto';

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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, dto: CreateUserDto): Promise<SafeUser> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be created within an organization');
    }

    const passwordHash = await argon2.hash(dto.password);
    return this.tenantPrisma.forTenant(context, (tx) =>
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
