import type { Viewer } from '../access/scope';

/**
 * Where a key reaches for contract workers and placements: the whole company, some legal entities or some locations
 * (sites). Other scope types (departments, reports) do not apply to people who are not employees. Null without the key,
 * and always while acting for someone else (P02 YX-SEC-20).
 */
export interface Reach {
  all: boolean;
  entities: string[];
  locations: string[];
}

export function reachOf(v: Viewer, key: string): Reach | null {
  if (v.actingForOther || !v.grants.has(key)) return null;
  const scopes = v.scopes.get(key) ?? [];
  const ids = (type: string) => scopes.filter((s) => s.type === type && s.id).map((s) => s.id as string);
  const r = { all: scopes.some((s) => s.type === 'tenant'), entities: ids('legal_entity'), locations: ids('location') };
  return r.all || r.entities.length || r.locations.length ? r : null;
}

/** Prisma filter for rows with a legal entity and (optionally) a site. */
type Within = { legalEntityId: { in: string[] } } | { locationId: { in: string[] } };
export function reachWhere(r: Reach): { OR?: Within[] } {
  if (r.all) return {};
  return { OR: [{ legalEntityId: { in: r.entities } }, { locationId: { in: r.locations } }] };
}

export const reaches = (r: Reach, entityId: string, locationId?: string | null) => r.all || r.entities.includes(entityId) || Boolean(locationId && r.locations.includes(locationId));
