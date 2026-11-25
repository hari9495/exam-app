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

const STATUTE_NAME: Record<string, string> = { 'IN.PF': 'PF', 'IN.ESI': 'ESI', 'IN.PT': 'PT' };

/**
 * Answer 821: the month's PF and ESI remittances for the pack, one row per filed return (challan or TRRN, amount, filed
 * day), "Not filed yet" for a statute the entity is registered for with nothing filed; those are named as missing.
 * Never the employee-level return file: it lists every employee of the entity, not only those at the client.
 */
/**
 * `ptDue` (answer 882): whether the site's state collects PT for the month (the IN.PT rule set's deduction months, e.g.
 * Tamil Nadu in September and March only). In another month an unfiled PT is not missing: it reads "Not due this month".
 */
export function challanRows(registered: { statute: string; registrationNo: string | null }[], filed: { statute: string; reference: string | null; amount: string | null; filedOn: string | null; receipt?: boolean }[], ptDue = true): { rows: string[][]; missing: string[] } {
  const rows: string[][] = [];
  const missing: string[] = [];
  // Answer 841: PT too, for the client site's state (the caller passes only that state's registration and filings).
  for (const statute of ['IN.PF', 'IN.ESI', 'IN.PT']) {
    const reg = registered.find((r) => r.statute === statute);
    if (!reg) continue;
    const name = STATUTE_NAME[statute]!;
    const mine = filed.filter((f) => f.statute === statute);
    if (!mine.length && statute === 'IN.PT' && !ptDue) {
      rows.push([name, reg.registrationNo ?? '', '', '', '', 'Not due this month']);
      continue;
    }
    if (!mine.length) {
      rows.push([name, reg.registrationNo ?? '', '', '', '', 'Not filed yet']);
      missing.push(`${name} challan`);
    }
    // Answer 842: a filed return with the bank's challan receipt says so (the receipt PDF is in the pack).
    for (const f of mine) rows.push([name, reg.registrationNo ?? '', f.reference ?? '', f.amount ?? '', f.filedOn ?? '', f.receipt ? 'Filed; bank receipt in the pack' : 'Filed']);
  }
  return { rows, missing };
}
