import { PrismaService } from '@exam-platform/shared';

// Keys a custom permission profile can never grant, regardless of what the org admin picks --
// these gate platform-level and org-owner-level actions (creating orgs, managing other users'
// accounts, billing) that a profile-scoped role must never reach. Enforced in
// PermissionProfilesService.validatePermissions on every create/update.
export const NON_ASSIGNABLE_PERMISSION_KEYS = [
  'platform:manage_organizations',
  'org:manage_users',
  'org:manage_billing',
] as const;

export function isAssignableKey(key: string): boolean {
  return !(NON_ASSIGNABLE_PERMISSION_KEYS as readonly string[]).includes(key);
}

export interface AssignablePermission {
  key: string;
  description: string;
}

// The DB Permission catalog minus the non-assignable keys -- what a profile editor may offer.
// `prisma` here is the raw global client (not `forTenant`): the Permission table carries no
// organizationId and isn't RLS-protected, it's a shared catalog.
export async function assignablePermissions(prisma: PrismaService): Promise<AssignablePermission[]> {
  const all = await prisma.permission.findMany({
    select: { key: true, description: true },
    orderBy: { key: 'asc' },
  });
  return all.filter((p) => isAssignableKey(p.key));
}
