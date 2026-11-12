import { Tx } from '../org-structure/org-structure.service';

/**
 * Helpdesk item 2: the devices assigned now to a person in the People asset register (handed over, not returned), with
 * an optional search by tag or name. RLS keeps it to the company; the person filter keeps it to their own.
 */
export async function assetsOf(tx: Tx, org: string, personId: string, q: string) {
  const term = q.trim();
  const held = (await tx.assetAssignment.findMany({ where: { organizationId: org, personId, returnedOn: null }, select: { assetId: true } })).map((x) => x.assetId);
  return tx.asset.findMany({
    where: { organizationId: org, id: { in: held }, ...(term ? { OR: [{ tag: { contains: term, mode: 'insensitive' as const } }, { name: { contains: term, mode: 'insensitive' as const } }] } : {}) },
    select: { id: true, name: true, tag: true, category: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
}
export const assetOption = (x: { id: string; name: string; tag: string; category: string }) => ({ id: x.id, label: `${x.name} (${x.tag})`, detail: x.category });

/** Answer 1661: a company device an IT agent may put on a ticket (not retired or lost); null when there is none. */
export function liveAsset(tx: Tx, org: string, id: string) {
  return tx.asset.findFirst({ where: { organizationId: org, id, status: { notIn: ['retired', 'lost'] } }, select: { id: true, name: true, tag: true, category: true } });
}
