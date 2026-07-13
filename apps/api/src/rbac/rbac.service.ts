import { Injectable } from '@nestjs/common';
import { PrismaService } from '@exam-platform/shared';

export interface RolePermissions {
  role: string;
  permissions: string[];
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

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
