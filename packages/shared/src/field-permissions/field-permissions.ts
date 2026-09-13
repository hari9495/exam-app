export const GOVERNABLE_ROLES = ['recruiter', 'panel', 'hiring_manager'] as const;
export const GOVERNED_FIELDS = {
  candidate: ['email', 'phone'] as const,
  job: ['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount', 'department', 'fitCriteria', 'fitRubric'] as const,
} as const;
export type FieldEntity = keyof typeof GOVERNED_FIELDS;

// Per-field access level for a role. Absent field = editable (full access). 'readonly' = visible but
// not editable; 'hidden' = redacted on read AND not editable.
export const FIELD_LEVELS = ['readonly', 'hidden'] as const;
export type FieldLevel = (typeof FIELD_LEVELS)[number];

// entity -> role -> field -> level. The stored form is this object shape; a LEGACY stored value
// where role maps to a string[] is read as "every listed field is hidden" (pre-readonly configs).
export type FieldPermissionConfig = Partial<Record<FieldEntity, Record<string, Record<string, FieldLevel>>>>;

function isLevel(v: unknown): v is FieldLevel {
  return typeof v === 'string' && (FIELD_LEVELS as readonly string[]).includes(v);
}

// Lenient normalize (for reads): accepts the object form AND the legacy array form, drops anything
// unrecognized, never throws.
function normalizeRoleMap(entity: FieldEntity, byRole: unknown): Record<string, Record<string, FieldLevel>> {
  const allowed = GOVERNED_FIELDS[entity] as readonly string[];
  const out: Record<string, Record<string, FieldLevel>> = {};
  if (!byRole || typeof byRole !== 'object' || Array.isArray(byRole)) return out;
  for (const [role, val] of Object.entries(byRole as Record<string, unknown>)) {
    if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) continue;
    const levels: Record<string, FieldLevel> = {};
    if (Array.isArray(val)) {
      for (const f of val) if (typeof f === 'string' && allowed.includes(f)) levels[f] = 'hidden';
    } else if (val && typeof val === 'object') {
      for (const [f, lvl] of Object.entries(val as Record<string, unknown>)) {
        if (allowed.includes(f) && isLevel(lvl)) levels[f] = lvl;
      }
    }
    if (Object.keys(levels).length) out[role] = levels;
  }
  return out;
}

export function parseFieldPermissions(json: string | null | undefined): FieldPermissionConfig {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: FieldPermissionConfig = {};
  for (const entity of Object.keys(GOVERNED_FIELDS) as FieldEntity[]) {
    const roleMap = normalizeRoleMap(entity, (parsed as Record<string, unknown>)[entity]);
    if (Object.keys(roleMap).length) out[entity] = roleMap;
  }
  return out;
}

// Strict validate (for writes): rejects unknown entity/role/field/level. Accepts the legacy array
// form (all hidden) for backward compatibility, and returns the canonical object form.
export function validateFieldPermissions(input: unknown): FieldPermissionConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('config must be an object');
  const out: FieldPermissionConfig = {};
  for (const [entity, byRole] of Object.entries(input as Record<string, unknown>)) {
    if (!(entity in GOVERNED_FIELDS)) throw new Error(`unknown entity ${entity}`);
    if (!byRole || typeof byRole !== 'object' || Array.isArray(byRole)) throw new Error(`invalid roles map for ${entity}`);
    const allowed = GOVERNED_FIELDS[entity as FieldEntity] as readonly string[];
    const roleMap: Record<string, Record<string, FieldLevel>> = {};
    for (const [role, val] of Object.entries(byRole as Record<string, unknown>)) {
      if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) throw new Error(`role ${role} is not governable`);
      const levels: Record<string, FieldLevel> = {};
      if (Array.isArray(val)) {
        for (const f of val) {
          if (typeof f !== 'string') throw new Error(`fields for ${entity}.${role} must be strings`);
          if (!allowed.includes(f)) throw new Error(`field ${f} is not governable on ${entity}`);
          levels[f] = 'hidden';
        }
      } else if (val && typeof val === 'object') {
        for (const [f, lvl] of Object.entries(val as Record<string, unknown>)) {
          if (!allowed.includes(f)) throw new Error(`field ${f} is not governable on ${entity}`);
          if (!isLevel(lvl)) throw new Error(`level for ${entity}.${role}.${f} must be one of ${FIELD_LEVELS.join(', ')}`);
          levels[f] = lvl;
        }
      } else {
        throw new Error(`invalid config for ${entity}.${role}`);
      }
      if (Object.keys(levels).length) roleMap[role] = levels;
    }
    if (Object.keys(roleMap).length) out[entity as FieldEntity] = roleMap;
  }
  return out;
}

function fieldsAtLevels(cfg: FieldPermissionConfig, entity: FieldEntity, role: string, levels: readonly FieldLevel[]): Set<string> {
  if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
  const allowed = GOVERNED_FIELDS[entity] as readonly string[];
  const roleMap = cfg[entity]?.[role] ?? {};
  return new Set(Object.entries(roleMap).filter(([f, lvl]) => allowed.includes(f) && levels.includes(lvl)).map(([f]) => f));
}

// Fields redacted on READ for this role (level 'hidden').
export function hiddenFieldsFor(cfg: FieldPermissionConfig, entity: FieldEntity, role: string): Set<string> {
  return fieldsAtLevels(cfg, entity, role, ['hidden']);
}

// Fields this role may NOT edit (level 'readonly' OR 'hidden'). Enforced on write paths.
export function lockedFieldsFor(cfg: FieldPermissionConfig, entity: FieldEntity, role: string): Set<string> {
  return fieldsAtLevels(cfg, entity, role, ['readonly', 'hidden']);
}

// Which locked fields an update actually tries to CHANGE: present in the incoming patch AND different
// from the stored value. A no-op resend of a locked field (same value) is allowed, so a client that
// PATCHes the whole object doesn't 403 on fields it isn't really changing.
export function lockedFieldEdits(
  locked: Set<string>,
  incoming: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const f of locked) {
    // Structural compare so array/object fields (e.g. a job's fit rubric) don't read as "changed"
    // just because of reference identity. Callers pass `current` shaped like the incoming patch.
    if (f in incoming && JSON.stringify(incoming[f] ?? null) !== JSON.stringify(current[f] ?? null)) out.push(f);
  }
  return out;
}
