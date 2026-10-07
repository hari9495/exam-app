import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { GrantScope, GrantScopeType, TENANT_SCOPE, grantScopesFor } from '../record-visibility/record-visibility';
import { isGrantOnlyKey } from '../field-permissions/employee-fields';

export interface PermissionSubject {
  role: string;
  organizationId: string | null;
  permissionProfileId?: string | null;
  /** When given, the user's active role grants (P02 §3, YX-SEC-03) are added to the base set. */
  userId?: string | null;
}

/**
 * The ONE place a staff user's effective permissions are resolved, shared by apps/api's HTTP
 * PermissionsGuard, the record scope engine and exam-runtime's monitoring socket so they can never disagree.
 * The base set, company-wide:
 *   1. an assigned permission profile REPLACES the role's grants (a missing/racing profile fails closed to
 *      no grants -- never a fallback to the role);
 *   2. otherwise a per-org override row for the role REPLACES the global default;
 *   3. otherwise the global role_permissions default.
 * Plus every active role grant of the user (P02 YX-SEC-03: rights are the union of grants), each with its
 * scope. A key in a grant narrower than its allowed scopes confers nothing (grantScopesFor).
 * `keys` narrows the global-default lookup to the keys the caller is about to check.
 */
export async function resolveScopedGrants(
  prisma: PrismaService,
  tenantPrisma: TenantPrismaService,
  subject: PermissionSubject,
  keys: string[],
): Promise<Map<string, GrantScope[]>> {
  const out = new Map<string, GrantScope[]>();
  const add = (key: string, scope: GrantScope) => {
    if (!grantScopesFor(key).includes(scope.type)) return;
    const list = out.get(key) ?? [];
    if (!list.some((s) => s.type === scope.type && s.id === scope.id)) list.push(scope);
    out.set(key, list);
  };
  for (const key of await baseGrants(prisma, tenantPrisma, subject, keys)) add(key, TENANT_SCOPE);

  const organizationId = subject.organizationId ?? null;
  if (organizationId && subject.userId) {
    const userId = subject.userId;
    // Active today in India time (the company calendar; P01 entities are IST-based until P21 lands).
    const grants = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.$queryRaw<{ scope_type: GrantScopeType; target: string | null; permissions_json: string }[]>`
        SELECT g.scope_type, COALESCE(g.legal_entity_id, g.location_id, g.department_id)::text AS target, p.permissions_json
        FROM role_grants g
        JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
        WHERE g.organization_id = ${organizationId}::uuid AND g.user_id = ${userId}::uuid AND g.status = 'active'
          AND g.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
          AND (g.valid_to IS NULL OR g.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)`,
    );
    for (const g of grants) {
      for (const key of JSON.parse(g.permissions_json) as string[]) add(key, { type: g.scope_type, id: g.target });
    }
  }
  return out;
}

/** The keys held at any scope: what the endpoint-level guard checks; records are scoped by the service. */
export async function resolvePermissionGrants(
  prisma: PrismaService,
  tenantPrisma: TenantPrismaService,
  subject: PermissionSubject,
  keys: string[],
): Promise<Set<string>> {
  return new Set((await resolveScopedGrants(prisma, tenantPrisma, subject, keys)).keys());
}

async function baseGrants(prisma: PrismaService, tenantPrisma: TenantPrismaService, subject: PermissionSubject, keys: string[]): Promise<string[]> {
  const organizationId = subject.organizationId ?? null;
  if (subject.permissionProfileId) {
    const profileId = subject.permissionProfileId;
    const profile = await tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.permissionProfile.findUnique({ where: { id: profileId }, select: { permissionsJson: true } }),
    );
    return profile ? (JSON.parse(profile.permissionsJson) as string[]) : [];
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
      // An override never confers HR or pay keys, even one stored before they were refused (P02 §4.6, R1).
      return (JSON.parse(override.permissionsJson) as string[]).filter((k) => !isGrantOnlyKey(k));
    }
  }
  const grants = await prisma.rolePermission.findMany({
    where: { role: subject.role, permission: { key: { in: keys } } },
    select: { permission: { select: { key: true } } },
  });
  return grants.map((g) => g.permission.key);
}
