import type { Tx } from '../org-structure/org-structure.service';
import { quarterMonths } from './statutory-filings.service';

// CMP-06 WrongQuarter: year-end certificates are issued against the tax year's filed fourth-quarter salary return (Part A
// comes from TRACES only after it is filed). A link to anything else is kept, shown, and blocks issuing.

export interface LinkedReturn {
  taxYear: string;
  quarter: number;
  status: string;
  kind: string;
}

const monthText = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const span = (taxYear: string, q: number) => {
  const m = quarterMonths(taxYear, q);
  return `${monthText(m[0])} to ${monthText(m[2])}`;
};

/** Why a linked return cannot carry the year's certificates; null when it can. */
export function form16LinkProblem(r: LinkedReturn, taxYear: string): string | null {
  if (r.taxYear !== taxYear) return `The return you chose is for tax year ${r.taxYear}. These certificates are for ${taxYear}: link its Q4 return.`;
  if (r.quarter !== 4) return `The return you chose is Q${r.quarter} (${span(r.taxYear, r.quarter)}). Certificates need the filed Q4 return (${span(taxYear, 4)}).`;
  if (r.kind !== 'original') return 'The return you chose is a correction. Link the original Q4 return.';
  if (r.status !== 'filed') return 'The Q4 return is not marked filed yet. Mark it filed, then issue the certificates.';
  return null;
}

/** The problem with the entity's link for the tax year (none linked: nothing to block). The pay guard must be open. */
export async function form16Block(tx: Tx, org: string, entityId: string, taxYear: string): Promise<string | null> {
  const link = await tx.form16ReturnLink.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear } });
  if (!link) return null;
  const r = await tx.tdsReturn.findFirstOrThrow({ where: { organizationId: org, id: link.tdsReturnId }, select: { taxYear: true, quarter: true, status: true, kind: true } });
  return form16LinkProblem(r, taxYear);
}
