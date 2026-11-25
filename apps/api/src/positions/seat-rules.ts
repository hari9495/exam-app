import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import type { ChangePayload, ChangeType } from '../employee-history/history-rules';

// Enterprise E1 (answers 2341, 2641): with positions on, a hire, promotion or transfer names a seat with room; a seat is
// only ever given while positions are on, in the person's legal entity, active on the date.
export const SEAT_REQUIRED: readonly ChangeType[] = ['join', 'promotion', 'transfer'];

export const positionsOn = async (tx: Tx, c: CompanyContext, legalEntityId: string) => (await settingFor(tx, c, 'org.positions.enabled', { legalEntityId })) === 'on';

/** The version of each seat in force on `date` (latest valid_from on or before it). */
export async function seatsOn(tx: Tx, org: string, date: string, ids?: string[]) {
  return tx.$queryRaw<{ position_id: string; status: string; headcount: number; legal_entity_id: string }[]>`
    SELECT DISTINCT ON (v.position_id) v.position_id, v.status, v.headcount, p.legal_entity_id
    FROM position_versions v JOIN positions p ON p.organization_id = v.organization_id AND p.id = v.position_id
    WHERE v.organization_id = ${org}::uuid AND v.valid_from <= ${date}::date ${ids ? Prisma.sql`AND v.position_id = ANY(${ids}::uuid[])` : Prisma.empty}
    ORDER BY v.position_id, v.valid_from DESC`;
}

/** People in each seat on `date` (one per employment), leaving out `exceptEmploymentId`. */
export async function incumbentsOn(tx: Tx, org: string, date: string, ids: string[], exceptEmploymentId?: string) {
  if (!ids.length) return new Map<string, number>();
  const rows = await tx.$queryRaw<{ position_id: string; n: number }[]>`
    SELECT position_id, count(DISTINCT employment_id)::int AS n FROM employee_assignments
    WHERE organization_id = ${org}::uuid AND position_id = ANY(${ids}::uuid[]) AND superseded_at IS NULL
      AND valid_from <= ${date}::date AND (valid_to IS NULL OR valid_to >= ${date}::date)
      ${exceptEmploymentId ? Prisma.sql`AND employment_id <> ${exceptEmploymentId}::uuid` : Prisma.empty}
    GROUP BY position_id`;
  return new Map(rows.map((r) => [r.position_id, r.n]));
}

/** Refuses a change whose seat is missing, wrong or full. shortcut: room is checked on the change's date only, not on every later day; check the whole span if seats start being shrunk under scheduled moves. */
export async function checkSeat(tx: Tx, c: CompanyContext, e: { id: string; legalEntityId: string }, p: ChangePayload, type: ChangeType, date: string) {
  const seat = p.assignment?.positionId;
  const on = await positionsOn(tx, c, e.legalEntityId);
  if (!on) {
    if (seat) throw new BadRequestException('Your company does not use positions, so a seat cannot be given.');
    return;
  }
  if (!seat) {
    if (SEAT_REQUIRED.includes(type) && p.assignment) throw new BadRequestException('Your company uses positions: choose the seat for this person.');
    return;
  }
  const [v] = await seatsOn(tx, c.organizationId, date, [seat]);
  if (!v) throw new BadRequestException('No such seat on that date.');
  if (v.legal_entity_id !== e.legalEntityId) throw new BadRequestException("The seat belongs to another legal entity.");
  if (v.status !== 'active') throw new BadRequestException(`The seat is ${v.status} on that date. Only an active seat can be filled.`);
  const taken = (await incumbentsOn(tx, c.organizationId, date, [seat], e.id)).get(seat) ?? 0;
  if (taken >= v.headcount) throw new BadRequestException(`The seat is full on that date (${taken} of ${v.headcount}).`);
}

/**
 * Enterprise E1 (O3): the org chart's empty seats on a date (active seats with fewer people than their headcount). Each
 * hangs under the person in its supervisor seat, else the next filled seat above it, so a vacant seat still shows.
 */
export async function seatVacancies(tx: Tx, org: string, date: string, entityId?: string) {
  const rows = await tx.$queryRaw<{ position_id: string; title: string; status: string; headcount: number; supervisor_position_id: string | null; department: string | null; location: string | null; legal_entity_id: string }[]>`
    SELECT DISTINCT ON (v.position_id) v.position_id, v.title, v.status, v.headcount, v.supervisor_position_id, d.name AS department, l.name AS location, p.legal_entity_id
    FROM position_versions v JOIN positions p ON p.organization_id = v.organization_id AND p.id = v.position_id
    LEFT JOIN departments d ON d.organization_id = v.organization_id AND d.id = v.department_id
    LEFT JOIN locations l ON l.organization_id = v.organization_id AND l.id = v.location_id
    WHERE v.organization_id = ${org}::uuid AND v.valid_from <= ${date}::date
    ORDER BY v.position_id, v.valid_from DESC`;
  const people = await tx.$queryRaw<{ position_id: string; employee_id: string }[]>`
    SELECT DISTINCT ON (employment_id) position_id, employee_id FROM employee_assignments
    WHERE organization_id = ${org}::uuid AND position_id IS NOT NULL AND superseded_at IS NULL AND valid_from <= ${date}::date AND (valid_to IS NULL OR valid_to >= ${date}::date)`;
  const bySeat = new Map<string, string[]>();
  for (const p of people) bySeat.set(p.position_id, [...(bySeat.get(p.position_id) ?? []), p.employee_id]);
  const seat = new Map(rows.map((r) => [r.position_id, r]));
  const holderAbove = (id: string | null) => {
    for (let hop = 0, at = id; at && hop < 100; hop++, at = seat.get(at)?.supervisor_position_id ?? null) {
      const who = bySeat.get(at);
      if (who?.length) return who[0];
    }
    return null;
  };
  return rows
    .filter((r) => r.status === 'active' && (!entityId || r.legal_entity_id === entityId))
    .map((r) => ({ r, open: r.headcount - (bySeat.get(r.position_id)?.length ?? 0) }))
    .filter((x) => x.open > 0)
    .map(({ r, open }) => ({ id: `pos:${r.position_id}`, role: r.title, department: r.department, location: r.location, managerEmployeeId: holderAbove(r.supervisor_position_id), openings: open }));
}
