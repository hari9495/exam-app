export const GOVERNABLE_ROLES = ['recruiter', 'panel'] as const;
export const GOVERNED_FIELDS = {
  candidate: ['email', 'phone'] as const,
  job: ['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount'] as const,
} as const;
export type FieldEntity = keyof typeof GOVERNED_FIELDS;
export type FieldPermissionConfig = Partial<Record<FieldEntity, Record<string, string[]>>>;

export function parseFieldPermissions(json: string | null | undefined): FieldPermissionConfig {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export function validateFieldPermissions(input: unknown): FieldPermissionConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('config must be an object');
  const out: FieldPermissionConfig = {};
  for (const [entity, byRole] of Object.entries(input as Record<string, unknown>)) {
    if (!(entity in GOVERNED_FIELDS)) throw new Error(`unknown entity ${entity}`);
    if (!byRole || typeof byRole !== 'object' || Array.isArray(byRole)) throw new Error(`invalid roles map for ${entity}`);
    const allowed = GOVERNED_FIELDS[entity as FieldEntity] as readonly string[];
    const roleMap: Record<string, string[]> = {};
    for (const [role, fields] of Object.entries(byRole as Record<string, unknown>)) {
      if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) throw new Error(`role ${role} is not governable`);
      if (!Array.isArray(fields) || !fields.every((f) => typeof f === 'string')) throw new Error(`fields for ${entity}.${role} must be strings`);
      for (const f of fields) if (!allowed.includes(f)) throw new Error(`field ${f} is not governable on ${entity}`);
      roleMap[role] = [...new Set(fields as string[])];
    }
    out[entity as FieldEntity] = roleMap;
  }
  return out;
}

export function hiddenFieldsFor(cfg: FieldPermissionConfig, entity: FieldEntity, role: string): Set<string> {
  if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
  const allowed = GOVERNED_FIELDS[entity] as readonly string[];
  const fields = cfg[entity]?.[role] ?? [];
  return new Set(fields.filter((f) => allowed.includes(f)));
}
