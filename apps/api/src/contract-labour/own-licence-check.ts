import { BadRequestException } from '@nestjs/common';
import type { Tx } from '../org-structure/org-structure.service';
import { coverOf, placementBlock } from './own-licence-rules';

// Contract labour CL-8 (answer 638): the database side of our own licences, shared by the CL-8 pages and the staffing
// placement create (which blocks a placement past the licence maximum). No services here: staffing imports this file.

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LICENCE_FIELDS = { id: true, licenceNo: true, clientSiteId: true, states: true, maxWorkers: true, validFrom: true, validTo: true, status: true, scope: true, issuedBy: true, legalEntityId: true } as const;

type SiteRow = { id: string; name: string; state: string; clientId: string };

export async function ownLicences(tx: Tx, org: string) {
  const rows = await tx.contractorLicence.findMany({ where: { organizationId: org, legalEntityId: { not: null } }, select: LICENCE_FIELDS, orderBy: { validTo: 'desc' } });
  return rows.map((l) => ({ ...l, validFrom: iso(l.validFrom), validTo: iso(l.validTo), legalEntityId: l.legalEntityId! }));
}

/** Our employees placed at the sites (active placements on a day). */
export async function placedOn(tx: Tx, org: string, siteIds: string[], on: string, exceptId: string | null = null) {
  return tx.staffingPlacement.count({ where: { organizationId: org, clientSiteId: { in: siteIds }, supply: 'own', status: 'active', startOn: { lte: day(on) }, endOn: { gte: day(on) }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
}

/** The state's licence threshold on a day (IN.CLRA, verify), or null when no rule is published. */
async function thresholdOf(tx: Tx, state: string, on: string) {
  const rule = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.CLRA', jurisdiction: state, status: 'published', validFrom: { lte: day(on) }, OR: [{ validTo: null }, { validTo: { gte: day(on) } }] }, orderBy: { validFrom: 'desc' } });
  const n = (rule?.values as { licenceThreshold?: number } | undefined)?.licenceThreshold;
  return typeof n === 'number' ? n : null;
}

/**
 * Answer 638 (CLB-07): one more of our employees at a client site on `startOn`. Counts our placements at every site the
 * covering licence reaches (the site, or every site of its states for a single licence); throws with the reason when the
 * licence is full, or when no licence covers the site and the state's threshold would be reached.
 */
export async function ownLicenceCheckIn(tx: Tx, org: string, site: SiteRow, startOn: string, exceptId: string | null = null) {
  const licence = coverOf(await ownLicences(tx, org), site, startOn);
  const sites = licence && !licence.clientSiteId
    ? (await tx.staffingClientSite.findMany({ where: { organizationId: org, state: { in: licence.states }, archivedAt: null }, select: { id: true } })).map((s) => s.id)
    : [site.id];
  const deployed = await placedOn(tx, org, sites, startOn, exceptId);
  const block = placementBlock({ licence, deployed, threshold: licence ? null : await thresholdOf(tx, site.state, startOn), site: site.name });
  if (block) throw new BadRequestException({ statusCode: 400, code: licence ? 'LICENCE_MAXIMUM' : 'NO_LICENCE', message: block });
  return { licence, deployed };
}

