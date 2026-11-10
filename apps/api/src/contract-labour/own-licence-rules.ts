// Contract labour CL-8 (CLB-06 … 08, founder answers 638, 639): the pure rules when we are the contractor. No database
// here, so every rule has a unit test. The thresholds are rule-set data (IN.CLRA per state, verify).

export interface OwnLicenceLike {
  id: string;
  licenceNo: string;
  clientSiteId: string | null;
  states: string[];
  maxWorkers: number;
  validFrom: string;
  validTo: string;
  status: string;
}

/** The licence that covers a client site on a day: one for that site first, else a single licence for its state. */
export function coverOf(licences: OwnLicenceLike[], site: { id: string; state: string }, on: string): OwnLicenceLike | null {
  const valid = licences.filter((l) => l.status === 'verified' && l.validFrom <= on && l.validTo >= on);
  return valid.find((l) => l.clientSiteId === site.id) ?? valid.find((l) => !l.clientSiteId && l.states.includes(site.state)) ?? null;
}

/**
 * Why one more of our employees cannot be placed at the site, or null. With a licence: never past its maximum (the
 * 51st of 50). Without one: below the state's licence threshold only (the law's number, verify).
 */
export function placementBlock(x: { licence: OwnLicenceLike | null; deployed: number; threshold: number | null; site: string }): string | null {
  if (x.licence) return x.deployed + 1 > x.licence.maxWorkers ? `Licence ${x.licence.licenceNo} allows ${x.licence.maxWorkers} at ${x.site}; ${x.deployed} are placed. Amend the licence or place elsewhere.` : null;
  if (x.threshold !== null && x.deployed + 1 >= x.threshold) return `No licence of ours covers ${x.site}, and ${x.deployed + 1} placed would reach the licence threshold (${x.threshold}). Add the licence first.`;
  return null;
}

/** The day a month's pack is due: the site's day of the next month. */
export function packDue(month: string, dueDay: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), dueDay));
  return d.toISOString().slice(0, 10);
}

export type PackState = 'Generated' | 'Uploaded' | 'Accepted' | 'Overdue';

/** A pack's state as the drawn cards show it. */
export function packState(p: { uploadedOn: string | null; acceptedAt: string | null }, due: string, today: string): PackState {
  if (p.acceptedAt) return 'Accepted';
  if (p.uploadedOn) return 'Uploaded';
  return today > due ? 'Overdue' : 'Generated';
}

/** Days present from the attendance days (a half day counts half). */
export function daysPresent(statuses: string[]): number {
  return statuses.reduce((n, s) => n + (s === 'present' ? 1 : s === 'half_day' ? 0.5 : 0), 0);
}
