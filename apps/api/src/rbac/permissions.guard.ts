import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';

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
    // A user with an assigned profile is authorized ONLY by that profile's keys -- the profile
    // REPLACES the role's default grants rather than adding to them, and any lookup miss (a
    // deleted/racing profile) fails closed to an empty grant set instead of falling back to role.
    const grantedKeys = user.permissionProfileId
      ? await this.resolveProfileGrants(user.permissionProfileId, user.organizationId ?? null)
      : await this.resolveRoleGrants(user.role, user.organizationId ?? null, allKeys);

    if (hasAllRequirement && !requiredAll!.every((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing required permission(s): ${requiredAll!.join(', ')}`);
    }
    if (hasAnyRequirement && !requiredAny!.some((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing any of required permission(s): ${requiredAny!.join(', ')}`);
    }
    return true;
  }

  private async resolveProfileGrants(profileId: string, organizationId: string | null): Promise<Set<string>> {
    const profile = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.permissionProfile.findUnique({ where: { id: profileId }, select: { permissionsJson: true } }),
    );
    if (!profile) {
      return new Set();
    }
    return new Set(JSON.parse(profile.permissionsJson) as string[]);
  }

  private async resolveRoleGrants(role: string, organizationId: string | null, keys: string[]): Promise<Set<string>> {
    // A per-org override REPLACES the global role default for that role in that org (Salesforce-style
    // role editing). No override row -> the global role_permissions default. Only editable roles ever
    // have a row (the role-permissions API refuses the rest), so org_admin/super_admin always fall
    // through to their fixed global defaults here.
    if (organizationId) {
      const override = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.orgRolePermission.findUnique({ where: { organizationId_role: { organizationId, role } }, select: { permissionsJson: true } }),
      );
      if (override) {
        return new Set(JSON.parse(override.permissionsJson) as string[]);
      }
    }
    const grants = await this.prisma.rolePermission.findMany({
      where: { role, permission: { key: { in: keys } } },
      select: { permission: { select: { key: true } } },
    });
    return new Set(grants.map((g) => g.permission.key));
  }
}
