import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@exam-platform/shared';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredAll = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler());
    const requiredAny = this.reflector.get<string[]>(PERMISSIONS_ANY_KEY, context.getHandler());
    const hasAllRequirement = Boolean(requiredAll && requiredAll.length > 0);
    const hasAnyRequirement = Boolean(requiredAny && requiredAny.length > 0);
    if (!hasAllRequirement && !hasAnyRequirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role: string } | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const allKeys = [...(requiredAll ?? []), ...(requiredAny ?? [])];
    const grants = await this.prisma.rolePermission.findMany({
      where: { role: user.role, permission: { key: { in: allKeys } } },
      select: { permission: { select: { key: true } } },
    });
    const grantedKeys = new Set(grants.map((g) => g.permission.key));

    if (hasAllRequirement && !requiredAll!.every((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing required permission(s): ${requiredAll!.join(', ')}`);
    }
    if (hasAnyRequirement && !requiredAny!.some((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing any of required permission(s): ${requiredAny!.join(', ')}`);
    }
    return true;
  }
}
