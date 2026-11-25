'use client';

import type { MasterRecord } from '@yukthix/ui/org';
import type { SeatChangeInput, SeatList, SeatOptions } from '@yukthix/ui/frame';
import { useOrg, useOrgWrite } from './yx-org';
import { useJoinerPlaces } from './yx-lifecycle';

// Enterprise E1 positions (POS-01 … POS-04): the seat list and the choices a seat form needs, from the org masters.

/** The seat form's choices: entities, departments, locations, designations, grades, cost centres and the other seats. */
export function useSeatOptions(enabled: boolean, seats: SeatList | null | undefined): SeatOptions {
  const places = useJoinerPlaces(enabled);
  const grades = useOrg<MasterRecord[]>('/masters/grades', enabled);
  const ccs = useOrg<MasterRecord[]>('/masters/cost-centres', enabled);
  const live = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt);
  return {
    entities: places.entities,
    departments: places.departments,
    locations: places.locations,
    designations: places.designations,
    grades: live(grades.data).map((g) => ({ value: g.id, label: g.name })),
    costCentres: live(ccs.data).map((c) => ({ value: c.id, label: c.name, entityId: c.legalEntityId ?? '' })),
    seats: (seats?.rows ?? []).filter((r) => r.status !== 'eliminated').map((r) => ({ value: r.id, label: `${r.code} · ${r.title}` })),
  };
}

/** Sends seat changes (one or many) for approval: POST org/positions/changes. */
export function useSendSeatChanges() {
  const write = useOrgWrite();
  return async (items: SeatChangeInput[], reason: string) => {
    await write('POST', '/positions/changes', { items, reason });
  };
}
