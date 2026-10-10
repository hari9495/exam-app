import { Prisma } from '@prisma/client';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { Viewer, covers, grantPeriods, started, tenantWide } from '../access/scope';

// Who reaches a person's documents and a joiner's record (lifecycle 6a, P02 §4.3). A person is reached either as an
// employee (the existing dated scope engine, YX-SEC-03/06) or, before day one, as a joiner, whose planned legal
// entity, location and department decide (D2: a joiner is not an employee yet). A document type's data class needs
// its own key on top (YX-SEC-07): Personal → employee.personal.view, Confidential / Special → employee.identity.view.

export const CLASS_KEY: Record<string, string | null> = {
  internal: null,
  personal: 'employee.personal.view',
  confidential: 'employee.identity.view',
  special: 'employee.identity.view',
};

export type JoinerScope = Pick<Prisma.PreboardingGetPayload<object>, 'legalEntityId' | 'locationId' | 'departmentId' | 'managerEmployeeId'>;

/** The signed-in user's own employee and person (null while acting for someone else: never "own" then). */
export async function ownOf(tx: Tx, c: CompanyContext, v: Viewer): Promise<{ employeeId: string | null; personId: string | null }> {
  if (!v.userId || v.actingForOther) return { employeeId: null, personId: null };
  const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true, personId: true } });
  return { employeeId: e?.id ?? null, personId: e?.personId ?? null };
}

/** Does `key` reach a joiner by their planned place? Company-wide, the entity, the location or a department above. */
export async function joinerInScope(tx: Tx, c: CompanyContext, v: Viewer, key: string, j: JoinerScope): Promise<boolean> {
  if (tenantWide(v, key)) return true;
  const scopes = v.scopes.get(key) ?? [];
  if (scopes.some((s) => (s.type === 'legal_entity' && s.id === j.legalEntityId) || (s.type === 'location' && s.id === j.locationId))) return true;
  const depts = scopes.filter((s) => s.type === 'department_subtree' && s.id);
  if (!depts.length || !j.departmentId) return false;
  const d = await tx.department.findFirst({ where: { organizationId: c.organizationId, id: j.departmentId }, select: { path: true } });
  return Boolean(d && depts.some((s) => d.path.includes(`/${s.id}/`)));
}

/** Does `key` reach this person today (as an employee in scope, or as a joiner in scope)? */
export async function reachesPerson(tx: Tx, c: CompanyContext, v: Viewer, key: string, personId: string, own: { employeeId: string | null }): Promise<boolean> {
  if (!v.grants.has(key)) return false;
  const emp = await tx.employee.findFirst({ where: { organizationId: c.organizationId, personId }, select: { id: true } });
  if (emp) return covers(started(await grantPeriods(tx, c, v, key, emp.id, own.employeeId), todayIst()), todayIst());
  const j = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, personId, status: 'invited' } });
  return Boolean(j && (await joinerInScope(tx, c, v, key, j)));
}

/** HR may act on a document type of this person: the action key plus the type's class key, never while acting for someone. */
export async function reachesDocument(tx: Tx, c: CompanyContext, v: Viewer, actionKey: string, sensitivity: string, personId: string, own: { employeeId: string | null }): Promise<boolean> {
  if (v.actingForOther && sensitivity !== 'internal') return false;
  if (!(await reachesPerson(tx, c, v, actionKey, personId, own))) return false;
  const classKey = CLASS_KEY[sensitivity];
  return classKey === null || (classKey !== undefined && (await reachesPerson(tx, c, v, classKey, personId, own)));
}
