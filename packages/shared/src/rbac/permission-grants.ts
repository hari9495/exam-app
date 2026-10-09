import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

export interface PermissionSubject {
  role: string;
  organizationId: string | null;
  permissionProfileId?: string | null;
}

// The ONE place a staff user's effective permission keys are resolved, shared by apps/api's HTTP
// PermissionsGuard and exam-runtime's monitoring socket so the two can never disagree:
//   1. an assigned permission profile REPLACES the role's grants (a missing/racing profile fails
//      closed to no grants -- never a fallback to the role);
//   2. otherwise a per-org override row for the role REPLACES the global default;
//   3. otherwise the global role_permissions default.
// `keys` narrows the global-default lookup to the keys the caller is about to check.
export async function resolvePermissionGrants(
  prisma: PrismaService,
  tenantPrisma: TenantPrismaService,
  subject: PermissionSubject,
  keys: string[],
): Promise<Set<string>> {
  const organizationId = subject.organizationId ?? null;
  if (subject.permissionProfileId) {
    const profileId = subject.permissionProfileId;
    const profile = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.permissionProfile.findUnique({ where: { id: profileId }, select: { permissionsJson: true } }),
    );
    return profile ? new Set(JSON.parse(profile.permissionsJson) as string[]) : new Set();
  }

  // Only editable roles ever have an override row (the role-permissions API refuses the rest), so
  // org_admin/super_admin always fall through to their fixed global defaults.
  if (organizationId) {
    const override = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.orgRolePermission.findUnique({
        where: { organizationId_role: { organizationId, role: subject.role } },
        select: { permissionsJson: true },
      }),
    );
    if (override) {
      return new Set(JSON.parse(override.permissionsJson) as string[]);
    }
  }
  const grants = await prisma.rolePermission.findMany({
    where: { role: subject.role, permission: { key: { in: keys } } },
    select: { permission: { select: { key: true } } },
  });
  return new Set(grants.map((g) => g.permission.key));
}
