import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService, TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { assignablePermissions, isAssignableKey, AssignablePermission } from './assignable-permissions';
import { EDITABLE_ROLES, isEditableRole } from './roles';

export interface RolePermissionRow {
  role: string;
  permissions: string[];
  customized: boolean; // true when an org override exists (differs from the global default)
}
export interface RolePermissionMatrix {
  assignablePermissions: AssignablePermission[];
  roles: RolePermissionRow[];
}

/**
 * Per-org editing of a staff role's permission set (the "Roles & Permissions" matrix). An org may
 * retune the EDITABLE_ROLES (hiring_manager/recruiter/panel); each override REPLACES that role's
 * global default for the org (enforced in PermissionsGuard). Removing the override reverts to the
 * seeded default. super_admin/org_admin are fixed and rejected here.
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMatrix(context: TenantContext): Promise<RolePermissionMatrix> {
    const organizationId = context.organizationId as string;
    // Global defaults straight from the (global) role_permissions table — the same source the guard
    // falls back to — so "default" here always matches what an un-overridden role actually gets.
    const grants = await this.prisma.rolePermission.findMany({
      where: { role: { in: [...EDITABLE_ROLES] } },
      select: { role: true, permission: { select: { key: true } } },
    });
    const defaultByRole = new Map<string, string[]>();
    for (const g of grants) {
      const list = defaultByRole.get(g.role) ?? [];
      list.push(g.permission.key);
      defaultByRole.set(g.role, list);
    }
    const overrides = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgRolePermission.findMany({ where: { organizationId, role: { in: [...EDITABLE_ROLES] } }, select: { role: true, permissionsJson: true } }),
    );
    const overrideByRole = new Map(overrides.map((o) => [o.role, JSON.parse(o.permissionsJson) as string[]]));

    const roles: RolePermissionRow[] = EDITABLE_ROLES.map((role) => {
      const override = overrideByRole.get(role);
      const permissions = (override ?? defaultByRole.get(role) ?? []).slice().sort();
      return { role, permissions, customized: override !== undefined };
    });
    return { assignablePermissions: await assignablePermissions(this.prisma), roles };
  }

  async setRolePermissions(context: TenantContext, actorUserId: string, role: string, permissions: string[]): Promise<RolePermissionMatrix> {
    if (!isEditableRole(role)) {
      throw new BadRequestException(`Role "${role}" is not editable`);
    }
    await this.validatePermissions(permissions);
    const organizationId = context.organizationId as string;
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgRolePermission.upsert({
        where: { organizationId_role: { organizationId, role } },
        create: { organizationId, role, permissionsJson: JSON.stringify(permissions) },
        update: { permissionsJson: JSON.stringify(permissions) },
      }),
    );
    await this.audit.record(context, {
      actorUserId,
      action: 'role_permissions.updated',
      entityType: 'role',
      entityId: role,
      metadata: { role, permissions },
    });
    return this.getMatrix(context);
  }

  async resetRole(context: TenantContext, actorUserId: string, role: string): Promise<RolePermissionMatrix> {
    if (!isEditableRole(role)) {
      throw new BadRequestException(`Role "${role}" is not editable`);
    }
    const organizationId = context.organizationId as string;
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgRolePermission.deleteMany({ where: { organizationId, role } }),
    );
    await this.audit.record(context, {
      actorUserId,
      action: 'role_permissions.reset',
      entityType: 'role',
      entityId: role,
      metadata: { role },
    });
    return this.getMatrix(context);
  }

  // Same allowlist as permission profiles: reject a non-assignable key (platform/user-mgmt/billing)
  // or any key the Permission catalog doesn't recognize. An empty set is allowed (lock a role down).
  private async validatePermissions(permissions: string[]): Promise<void> {
    const catalog = await assignablePermissions(this.prisma);
    const catalogKeys = new Set(catalog.map((p) => p.key));
    for (const key of permissions) {
      if (!isAssignableKey(key)) throw new BadRequestException(`Permission "${key}" is not assignable to a role`);
      if (!catalogKeys.has(key)) throw new BadRequestException(`Unknown permission "${key}"`);
    }
  }
}
