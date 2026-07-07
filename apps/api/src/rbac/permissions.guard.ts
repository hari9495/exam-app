import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler());
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role: string } | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const grants = await this.prisma.rolePermission.findMany({
      where: { role: user.role, permission: { key: { in: required } } },
      select: { permission: { select: { key: true } } },
    });
    const grantedKeys = new Set(grants.map((g) => g.permission.key));
    const hasAll = required.every((key) => grantedKeys.has(key));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(', ')}`);
    }
    return true;
  }
}
