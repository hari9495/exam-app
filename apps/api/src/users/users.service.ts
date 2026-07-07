import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, dto: CreateUserDto): Promise<User> {
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
      }),
    );
  }

  async list(context: TenantContext): Promise<User[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findMany({ where: { organizationId: context.organizationId } }),
    );
  }
}
