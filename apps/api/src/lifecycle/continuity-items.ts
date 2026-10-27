import type { Tx } from '../org-structure/org-structure.service';
import type { ChangePayload } from '../employee-history/history-rules';

/** PPL-10 payroll pre-flight: per employee, the continuity items still open after a move into this entity. */
export async function openContinuity(tx: Tx, org: string, legalEntityId: string, employeeIds: string[]): Promise<{ employeeId: string; titles: string[] }[]> {
  if (!employeeIds.length) return [];
  const moves = await tx.employeeChange.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, changeType: 'entity_transfer', status: 'effective' }, select: { id: true, employeeId: true, payload: true } });
  const into = moves.filter((m) => (m.payload as ChangePayload).transfer?.legalEntityId === legalEntityId);
  if (!into.length) return [];
  const journeys = await tx.journey.findMany({ where: { organizationId: org, kind: 'continuity', status: 'active', subjectId: { in: into.map((m) => m.id) } }, select: { id: true, subjectId: true } });
  const tasks = journeys.length ? await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: { in: journeys.map((j) => j.id) }, status: { in: ['open', 'waiting'] } }, orderBy: { sortOrder: 'asc' }, select: { journeyId: true, title: true } }) : [];
  return journeys
    .map((j) => ({ employeeId: into.find((m) => m.id === j.subjectId)!.employeeId, titles: tasks.filter((t) => t.journeyId === j.id).map((t) => t.title) }))
    .filter((x) => x.titles.length);
}
