import { Prisma } from '@prisma/client';
import { todayIst } from '../org-structure/org-validation';

type Tx = Prisma.TransactionClient;

// E2 parts 2 and 3 (O25, O26; review items 7, 8 and 9; answer 2788): approvers worked out from the request instead of
// named in advance.
//   key_holders  holders of a key for the request's legal entity, department or location: grants scoped to it first,
//                company-wide holders only when there are none (2788); ordered; at most 25 people, so "all" or "count"
//                is refused on it.
//   chain_until  up the manager chain of the person the request is for until someone's grade rank reaches a grade, or
//                their approval limit covers the amount: people taken out (the requester, who raised it) are skipped and
//                the walk goes on, up to 8 levels with a loop guard; ranks compare within the request's legal entity.
// The step keeps what it needs (requires), so decide, delegation, escalation and reassign check it again: someone who has
// lost the key or the grade since the request was sent no longer decides it (review item 7).

export const MAX_HOLDERS = 25;
export const MAX_CHAIN = 8;

/** The request families an approval limit is kept for, and the request types of each. */
export const LIMIT_FAMILIES: Readonly<Record<string, { label: string; types: string[] }>> = {
  expense: { label: 'Expenses', types: ['expense.claim', 'expense.trip', 'expense.advance'] },
  hiring: { label: 'Hiring', types: ['ats.requisition', 'ats.offer'] },
  pay: { label: 'Pay', types: ['payroll.one_time', 'payroll.loan'] },
};
export const familyOf = (type: string) => Object.entries(LIMIT_FAMILIES).find(([, f]) => f.types.includes(type))?.[0] ?? null;

export type KeyHoldersSpec = { kind: 'key_holders'; key: string; scope: 'entity' | 'department' | 'location' };
export type ChainSpec = { kind: 'chain_until'; until: 'grade'; gradeRank: number } | { kind: 'chain_until'; until: 'limit'; family: string };

/** What a frozen step needs of whoever decides it (any one of these). */
export type Requirement = { key: string; scope: KeyHoldersSpec['scope']; placeId: string | null } | { rank: number; entityId: string | null } | { family: string; amount: string; entityId: string | null };

export interface Place {
  entityId: string | null;
  departmentId: string | null;
  locationId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = () => new Date(`${todayIst()}T00:00:00Z`);

/** The current assignment of an employee (by person, else by login). */
async function assignmentOf(tx: Tx, org: string, by: { personId?: string | null; userId?: string | null; employeeId?: string | null }) {
  const emp = by.employeeId
    ? { id: by.employeeId }
    : await tx.employee.findFirst({ where: { organizationId: org, ...(by.personId ? { personId: by.personId } : { userId: by.userId ?? '00000000-0000-0000-0000-000000000000' }) }, select: { id: true } });
  if (!emp) return null;
  const today = day();
  return tx.employeeAssignment.findFirst({
    where: { organizationId: org, employeeId: emp.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
    orderBy: { validFrom: 'desc' },
    select: { legalEntityId: true, departmentId: true, locationId: true, gradeId: true, managerEmployeeId: true },
  });
}

/** Where the request belongs: the payload's legal entity when it names one, else the person's current assignment. */
export async function placeOf(tx: Tx, org: string, personId: string | null, userId: string | null, payload: Record<string, unknown>): Promise<Place> {
  const a = await assignmentOf(tx, org, { personId, userId });
  const ent = payload.legal_entity_id;
  return { entityId: typeof ent === 'string' && UUID.test(ent) ? ent : (a?.legalEntityId ?? null), departmentId: a?.departmentId ?? null, locationId: a?.locationId ?? null };
}

/** Holders of `key` for this place: scoped grants first; company-wide holders only when none (2788). Ordered, at most 25. */
export async function keyHolders(tx: Tx, org: string, key: string, scope: KeyHoldersSpec['scope'], place: Place): Promise<string[]> {
  const like = `%"${key}"%`;
  const today = todayIst();
  const placeId = scope === 'entity' ? place.entityId : scope === 'department' ? place.departmentId : place.locationId;
  const scoped = placeId
    ? await tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT u.id::text AS id, u.name FROM role_grants g
      JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
      JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
      LEFT JOIN departments d ON d.organization_id = g.organization_id AND d.id = ${placeId}::uuid
      WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
        AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
        AND ((${scope}::text = 'entity' AND g.scope_type = 'legal_entity' AND g.legal_entity_id = ${placeId}::uuid)
          OR (${scope}::text = 'location' AND g.scope_type = 'location' AND g.location_id = ${placeId}::uuid)
          OR (${scope}::text = 'department' AND g.scope_type = 'department_subtree' AND d.path LIKE '%/' || g.department_id::text || '/%'))
      ORDER BY u.name, u.id::text LIMIT ${MAX_HOLDERS}`
    : [];
  if (scoped.length) return scoped.map((r) => r.id);
  const wide = await tx.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT u.id::text AS id, u.name FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
    UNION
    SELECT DISTINCT u.id::text, u.name FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND g.scope_type = 'tenant' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
    ORDER BY 2, 1 LIMIT ${MAX_HOLDERS}`;
  return wide.map((r) => r.id);
}

/** A login's grade (rank) today, only when the grade applies in that legal entity. */
async function rankOf(tx: Tx, org: string, userId: string, entityId: string | null): Promise<{ gradeId: string; rank: number } | null> {
  const a = await assignmentOf(tx, org, { userId });
  if (!a?.gradeId) return null;
  const g = await tx.grade.findFirst({ where: { organizationId: org, id: a.gradeId, archivedAt: null }, select: { id: true, rank: true, ownerLegalEntityId: true, appliesToEntities: true } });
  if (!g) return null;
  if (entityId && g.ownerLegalEntityId && g.ownerLegalEntityId !== entityId && !g.appliesToEntities.includes(entityId)) return null;
  return { gradeId: g.id, rank: g.rank };
}

/** Does this login meet one of the step's requirements today? */
export async function meets(tx: Tx, org: string, userId: string, requires: Requirement[] | undefined): Promise<boolean> {
  if (!requires?.length) return true;
  for (const r of requires) {
    if ('key' in r) {
      // Still holding the key: a grant for the place, or company-wide (2788 orders who is picked, not who may decide).
      const place = { entityId: r.scope === 'entity' ? r.placeId : null, departmentId: r.scope === 'department' ? r.placeId : null, locationId: r.scope === 'location' ? r.placeId : null };
      if ((await keyHolders(tx, org, r.key, r.scope, place)).includes(userId)) return true;
      if ((await keyHolders(tx, org, r.key, r.scope, { entityId: null, departmentId: null, locationId: null })).includes(userId)) return true;
      continue;
    }
    const g = await rankOf(tx, org, userId, r.entityId);
    if (!g) continue;
    if ('rank' in r && g.rank >= r.rank) return true;
    if ('family' in r) {
      const lim = await tx.approvalLimit.findFirst({ where: { organizationId: org, family: r.family, gradeId: g.gradeId } });
      if (lim && lim.amount.gte(r.amount)) return true;
    }
  }
  return false;
}

/** Up the chain from the person the request is for until someone meets `need`; excluded people are skipped. */
export async function chainUntil(tx: Tx, org: string, start: { personId: string | null; userId: string | null }, excluded: Set<string>, need: Requirement): Promise<string | null> {
  let a = await assignmentOf(tx, org, start);
  const seen = new Set<string>();
  for (let i = 0; i < MAX_CHAIN && a?.managerEmployeeId && !seen.has(a.managerEmployeeId); i++) {
    seen.add(a.managerEmployeeId);
    const boss = await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { id: true, userId: true } });
    if (!boss) return null;
    if (boss.userId && !excluded.has(boss.userId) && (await meets(tx, org, boss.userId, [need]))) return boss.userId;
    a = await assignmentOf(tx, org, { employeeId: boss.id });
  }
  return null;
}
