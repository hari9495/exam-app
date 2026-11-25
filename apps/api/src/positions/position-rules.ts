import { BadRequestException } from '@nestjs/common';
import type { Tx } from '../org-structure/org-structure.service';

// Enterprise E1: the rules of a seat's values, its status moves and the switch-on grouping. Pure where it can be.

export interface SeatValues {
  title: string;
  departmentId: string;
  locationId: string;
  designationId: string;
  gradeIds: string[];
  defaultGradeId: string | null;
  fte: number;
  headcount: number;
  supervisorPositionId: string | null;
  costCentreId: string | null;
  entrySalary: number | null;
}

/** The status after a change, or null when the move is not allowed (O2: proposed → active → frozen ↔ active → eliminated). */
export function nextStatus(now: string, kind: string): string | null {
  if (now === 'eliminated') return null;
  if (kind === 'change') return now;
  if (kind === 'freeze') return now === 'active' ? 'frozen' : null;
  if (kind === 'activate') return now === 'proposed' || now === 'frozen' ? 'active' : null;
  if (kind === 'eliminate') return 'eliminated';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks a seat's values in its legal entity (masters usable there, no supervisor loop) and returns them cleaned. */
export async function checkSeatValues(tx: Tx, org: string, entity: string, raw: Partial<SeatValues>, selfId: string | null, date: string, at: (m: string) => string): Promise<SeatValues> {
  const bad = (m: string) => new BadRequestException(at(m));
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title.length < 2 || title.length > 120 || /[<>]/.test(title)) throw bad('give a title of 2 to 120 characters, without < or >.');
  for (const k of ['departmentId', 'locationId', 'designationId'] as const) if (typeof raw[k] !== 'string' || !UUID.test(raw[k] as string)) throw bad(`choose the ${k.replace(/Id$/, '')}.`);
  const gradeIds = [...new Set(Array.isArray(raw.gradeIds) ? raw.gradeIds : [])];
  if (gradeIds.length > 20 || gradeIds.some((g) => typeof g !== 'string' || !UUID.test(g))) throw bad('choose up to 20 valid grades.');
  const defaultGradeId = raw.defaultGradeId ?? (gradeIds.length === 1 ? gradeIds[0] : null);
  if (defaultGradeId && !gradeIds.includes(defaultGradeId)) throw bad('the default grade must be one of the valid grades.');
  const fte = Number(raw.fte ?? 1);
  if (!(fte > 0 && fte <= 1) || Math.round(fte * 100) !== fte * 100) throw bad('FTE is above 0 and at most 1 (two decimals).');
  const headcount = Number(raw.headcount ?? 1);
  if (!Number.isInteger(headcount) || headcount < 1 || headcount > 10000) throw bad('headcount is a whole number from 1 to 10,000.');
  const entrySalary = raw.entrySalary === null || raw.entrySalary === undefined ? null : Number(raw.entrySalary);
  if (entrySalary !== null && !(entrySalary > 0 && entrySalary < 1e11)) throw bad('the entry salary is a positive yearly amount.');

  const sel = { archivedAt: true, ownerLegalEntityId: true, appliesToEntities: true } as const;
  const usable = (m: { archivedAt: Date | null; ownerLegalEntityId: string | null; appliesToEntities: string[] } | null, what: string) => {
    if (!m) throw bad(`no such ${what} in this company.`);
    if (m.archivedAt) throw bad(`that ${what} is archived.`);
    if (m.ownerLegalEntityId ? m.ownerLegalEntityId !== entity : m.appliesToEntities.length > 0 && !m.appliesToEntities.includes(entity)) throw bad(`that ${what} is not available to this legal entity.`);
  };
  usable(await tx.department.findFirst({ where: { organizationId: org, id: raw.departmentId! }, select: sel }), 'department');
  usable(await tx.designation.findFirst({ where: { organizationId: org, id: raw.designationId! }, select: sel }), 'designation');
  for (const g of gradeIds) usable(await tx.grade.findFirst({ where: { organizationId: org, id: g }, select: sel }), 'grade');
  const loc = await tx.location.findFirst({ where: { organizationId: org, id: raw.locationId! }, select: { archivedAt: true, legalEntityId: true } });
  if (!loc || loc.archivedAt) throw bad('no such location in this company.');
  if (loc.legalEntityId !== entity) throw bad('the location belongs to another legal entity.');
  const costCentreId = raw.costCentreId ?? null;
  if (costCentreId) {
    const cc = await tx.costCentre.findFirst({ where: { organizationId: org, id: costCentreId }, select: { archivedAt: true, legalEntityId: true } });
    if (!cc || cc.archivedAt) throw bad('no such cost centre in this company.');
    if (cc.legalEntityId !== entity) throw bad('the cost centre belongs to another legal entity.');
  }
  const supervisorPositionId = raw.supervisorPositionId ?? null;
  if (supervisorPositionId) {
    if (supervisorPositionId === selfId) throw bad('a seat cannot report to itself.');
    // Walk up from the supervisor on the date: reaching this seat again would make a loop.
    let at2: string | null = supervisorPositionId;
    for (let hop = 0; at2 && hop < 100; hop++) {
      const [v]: { supervisor_position_id: string | null; status: string }[] = await tx.$queryRaw<{ supervisor_position_id: string | null; status: string }[]>`
        SELECT supervisor_position_id, status FROM position_versions WHERE organization_id = ${org}::uuid AND position_id = ${at2}::uuid AND valid_from <= ${date}::date ORDER BY valid_from DESC LIMIT 1`;
      if (!v) throw bad(hop === 0 ? 'no such supervisor seat on that day.' : 'the supervisor chain has a seat that does not exist on that day.');
      if (hop === 0 && v.status === 'eliminated') throw bad('the supervisor seat is eliminated on that day.');
      if (selfId && v.supervisor_position_id === selfId) throw bad('that supervisor reports to this seat: the chain would loop.');
      at2 = v.supervisor_position_id;
    }
  }
  return { title, departmentId: raw.departmentId!, locationId: raw.locationId!, designationId: raw.designationId!, gradeIds, defaultGradeId, fte, headcount, supervisorPositionId, costCentreId, entrySalary };
}

export interface SwitchOnPerson {
  employmentId: string;
  employeeId: string;
  name: string;
  legalEntityId: string;
  departmentId: string;
  locationId: string;
  designationId: string;
  gradeId: string | null;
  managerEmployeeId: string | null;
  /** The one cost centre the person is charged to in full, else null. */
  costCentreId: string | null;
}
export interface SwitchOnGroup {
  key: string;
  legalEntityId: string;
  departmentId: string;
  locationId: string;
  designationId: string;
  gradeId: string | null;
  costCentreId: string | null;
  /** The group whose people manage this group's people, when they all share one; else null. */
  supervisorKey: string | null;
  people: SwitchOnPerson[];
}

/**
 * Answer 2642: one seat per group of identical jobs (legal entity, department, location, designation, grade); headcount =
 * the people in it. The seat's cost centre is the group's shared one (else none); its supervisor is the seat of the group
 * all its managers sit in, when there is exactly one such group (never itself).
 */
export function groupForSwitchOn(people: SwitchOnPerson[]): SwitchOnGroup[] {
  const keyOf = (p: SwitchOnPerson) => [p.legalEntityId, p.departmentId, p.locationId, p.designationId, p.gradeId ?? '-'].join('|');
  const groups = new Map<string, SwitchOnGroup>();
  for (const p of people) {
    const key = keyOf(p);
    const g = groups.get(key) ?? { key, legalEntityId: p.legalEntityId, departmentId: p.departmentId, locationId: p.locationId, designationId: p.designationId, gradeId: p.gradeId, costCentreId: p.costCentreId, supervisorKey: null, people: [] };
    if (g.costCentreId !== p.costCentreId) g.costCentreId = null;
    g.people.push(p);
    groups.set(key, g);
  }
  const groupOfEmployee = new Map(people.map((p) => [p.employeeId, keyOf(p)]));
  for (const g of groups.values()) {
    const above = new Set(g.people.map((p) => (p.managerEmployeeId ? (groupOfEmployee.get(p.managerEmployeeId) ?? '?') : '?')));
    const [only] = [...above];
    g.supervisorKey = above.size === 1 && only !== '?' && only !== g.key ? only : null;
  }
  // Supervisors never loop (a group above its own supervisor's supervisor is dropped).
  for (const g of groups.values()) {
    const seen = new Set([g.key]);
    for (let k = g.supervisorKey; k; k = groups.get(k)?.supervisorKey ?? null) {
      if (seen.has(k)) {
        g.supervisorKey = null;
        break;
      }
      seen.add(k);
    }
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
