import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { RecordValues } from '../rules-engine/conditions';

/** The person's department, location, cost centre and legal entity today (P01), for audiences, form rules and branches. */
export async function profileOf(tx: Tx, org: string, personId: string): Promise<RecordValues> {
  const today = new Date(`${todayIst()}T00:00:00Z`);
  const emp = await tx.employee.findFirst({ where: { organizationId: org, personId }, select: { id: true } });
  const a = emp
    ? await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: emp.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' } })
    : null;
  const cc = a ? await tx.assignmentCostCentre.findFirst({ where: { organizationId: org, assignmentId: a.id }, orderBy: { percent: 'desc' } }) : null;
  return { 'requester.department': a?.departmentId ?? null, 'requester.location': a?.locationId ?? null, 'requester.legal_entity': a?.legalEntityId ?? null, 'requester.cost_centre': cc?.costCentreId ?? null };
}
