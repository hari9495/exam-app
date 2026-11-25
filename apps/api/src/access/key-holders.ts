import type { Tx } from '../org-structure/org-structure.service';

/**
 * Active people who hold `key` for the whole company today: people whose role holds it (role_permissions), people whose
 * permission profile has it, and active company-wide grants of a profile with it.
 */
export async function companyKeyHolders(tx: Tx, org: string, key: string, today: string): Promise<string[]> {
  const like = `%"${key}"%`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id::text FROM users u JOIN role_permissions rp ON rp.role = u.role JOIN permissions k ON k.id = rp.permission_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND (u.permission_profile_id IS NULL OR u.role = 'org_admin') AND k.key = ${key}
    UNION
    SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
    UNION
    SELECT g.user_id::text FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND g.scope_type = 'tenant' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
    LIMIT 50`;
  return rows.map((r) => r.id);
}
