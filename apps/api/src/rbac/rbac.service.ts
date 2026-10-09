import { Injectable } from '@nestjs/common';
import { PrismaService, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';

export interface RolePermissions {
  role: string;
  permissions: string[];
}

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** The subset of `keys` this user holds, resolved exactly as PermissionsGuard resolves them. */
  async grantedKeys(user: { userId?: string; role: string; organizationId?: string | null; permissionProfileId?: string | null }, keys: string[]): Promise<string[]> {
    const granted = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId, userId: user.userId ?? null }, keys);
    return [...new Set(keys)].filter((k) => granted.has(k));
  }

  async listRoles(): Promise<RolePermissions[]> {
    const grants = await this.prisma.rolePermission.findMany({
      include: { permission: { select: { key: true } } },
    });

    const byRole = new Map<string, string[]>();
    for (const grant of grants) {
      const keys = byRole.get(grant.role) ?? [];
      keys.push(grant.permission.key);
      byRole.set(grant.role, keys);
    }

    return [...byRole.entries()]
      .map(([role, permissions]) => ({ role, permissions: permissions.sort() }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }
}
