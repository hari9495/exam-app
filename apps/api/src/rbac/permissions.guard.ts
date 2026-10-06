import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  NETWORK_NOT_ALLOWED_MESSAGE,
  PrismaService,
  TenantPrismaService,
  ipAllowedForSurface,
  loadTenantSecurityPolicy,
  resolvePermissionGrants,
} from '@exam-platform/shared';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';

// Endpoints gated by these permissions are the "admin console" for the company's admin IP
// allow-list (YX-IAM-09): organisation administration -- users, settings/security, billing.
const ADMIN_CONSOLE_PERMISSION = /^org:manage_/;

interface RequestUser {
  role: string;
  organizationId?: string | null;
  permissionProfileId?: string | null;
  actingSuperAdmin?: boolean;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
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
    const user = request.user as RequestUser | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (user.actingSuperAdmin) {
      return true;
    }

    const allKeys = [...(requiredAll ?? []), ...(requiredAny ?? [])];
    // Tenant staff only: platform super admins are bound by staff controls (Q7), not tenant lists.
    if (user.organizationId && user.role !== 'super_admin' && allKeys.some((key) => ADMIN_CONSOLE_PERMISSION.test(key))) {
      const policy = await loadTenantSecurityPolicy(this.tenantPrisma, user.organizationId);
      if (!ipAllowedForSurface(policy, 'admin', request.ip)) {
        throw new ForbiddenException(NETWORK_NOT_ALLOWED_MESSAGE);
      }
    }
    // Profile > per-org role override > global role default; see resolvePermissionGrants.
    const grantedKeys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, {
      role: user.role,
      organizationId: user.organizationId ?? null,
      permissionProfileId: user.permissionProfileId,
    }, allKeys);

    if (hasAllRequirement && !requiredAll!.every((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing required permission(s): ${requiredAll!.join(', ')}`);
    }
    if (hasAnyRequirement && !requiredAny!.some((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing any of required permission(s): ${requiredAny!.join(', ')}`);
    }
    return true;
  }
}
