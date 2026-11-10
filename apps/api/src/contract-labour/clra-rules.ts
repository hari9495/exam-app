// Contract labour CL-1 (answers 621, 627): pure rules for contractor licences. The law's numbers come from the rule set
// IN.CLRA (verify), the alert days from the company setting clra.licence_alerts; nothing here is a legal number.

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** PF establishment code: 2-letter state, 3-letter office, 7 digits, optional 3-digit extension (TNMAS0012345000). */
export const PF_CODE = /^[A-Z]{5}[0-9]{7}([0-9]{3})?$/;
/** ESIC employer code: 17 digits. */
export const ESIC_CODE = /^[0-9]{17}$/;
/** Shram Suvidha LIN: 10 digits, sometimes written with hyphens (question 671: verify the format). */
export const LIN = /^[0-9][0-9-]{8,11}[0-9]$/;

export interface LicenceLike {
  id: string;
  locationId: string;
  states: string[];
  validFrom: string;
  validTo: string;
  status: 'pending' | 'verified' | 'rejected';
  renewalOfId: string | null;
}

export type LicenceState = 'pending' | 'rejected' | 'not-started' | 'valid' | 'expiring' | 'expired' | 'renewed';

/**
 * Where a licence stands on a day. `alertDays` (company setting) sets how early "expiring" starts; a verified licence
 * that a verified renewal follows on reads "renewed" once it has ended.
 */
export function licenceState(l: LicenceLike, today: string, alertDays: number[], all: LicenceLike[] = []): LicenceState {
  if (l.status !== 'verified') return l.status;
  if (today < l.validFrom) return 'not-started';
  if (today > l.validTo) return all.some((r) => r.renewalOfId === l.id && r.status === 'verified') ? 'renewed' : 'expired';
  const lead = Math.max(0, ...alertDays);
  const renewed = all.some((r) => r.renewalOfId === l.id && r.status === 'verified');
  return !renewed && daysBetween(today, l.validTo) <= lead ? 'expiring' : 'valid';
}

/**
 * Answer 627 (law, always on): a contractor deploys at an establishment on a day only under a verified licence for that
 * establishment that is in force on the day and covers the establishment's state. Pending or rejected licences and
 * renewals never count. Returns null when deployment is allowed, else the reason in plain words.
 */
export function deployBlock(licences: LicenceLike[], at: { locationId: string; state: string; on: string }): string | null {
  const here = licences.filter((l) => l.locationId === at.locationId && l.status === 'verified');
  if (!here.length) return 'The contractor has no verified licence for this establishment.';
  const inForce = here.filter((l) => l.validFrom <= at.on && at.on <= l.validTo);
  if (!inForce.length) {
    const pending = licences.some((l) => l.locationId === at.locationId && l.status === 'pending');
    return pending ? 'The licence has expired and its renewal is waiting for verification.' : 'The contractor’s licence is not valid on this day.';
  }
  if (!inForce.some((l) => l.states.includes(at.state))) return 'The licence does not cover this establishment’s state.';
  return null;
}

/** The alert lead day that falls today for a licence ending on `validTo`, if any (alerts are sent once per lead day). */
export function alertDue(validTo: string, today: string, alertDays: number[]): number | null {
  const left = daysBetween(today, validTo);
  return alertDays.includes(left) ? left : null;
}

/** The company setting clra.licence_alerts ("60,30,7") as numbers, largest first. */
export const alertDaysOf = (value: string) =>
  value
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);

/* ---------------- CL-2: deploying a contract worker (answers 632, 633, 635) ---------------- */

/** Whole years of age on a day (a birthday on 29 Feb counts on 1 Mar in other years). */
export function ageOn(dob: string, on: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [Y, M, D] = on.split('-').map(Number) as [number, number, number];
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}

/** The day `months` after `iso`, less one day (an induction on 10 Mar 2026 for 12 months lasts to 9 Mar 2027). */
export function monthsLater(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return new Date(t.getTime() - DAY).toISOString().slice(0, 10);
}

/** Answer 633: a gate pass ends with the deployment, the licence or the induction, whichever comes first. */
export function gateValidTo(i: { toOn: string | null; licenceValidTo: string; inductionOn: string | null; inductionMonths: number | null }): string {
  const ends = [i.licenceValidTo, i.toOn, i.inductionOn && i.inductionMonths ? monthsLater(i.inductionOn, i.inductionMonths) : null].filter((x): x is string => Boolean(x));
  return ends.sort()[0]!;
}

export type CheckStatus = 'pass' | 'fail' | 'warn';
export interface WorkerCheck {
  id: 'age' | 'licence' | 'max' | 'dup' | 'threshold';
  status: CheckStatus;
  label: string;
  detail?: string;
}

/**
 * The deployment checks (answer 635, law, no override): age on the first day at least the rule set's minimum; a verified
 * licence for the site in force on the day and covering its state (deployBlock); room under the licence maximum; the
 * same ID not pending or deployed anywhere. The registration threshold is a warning until registrations are recorded
 * (question 681).
 */
export function workerChecks(i: {
  dob: string;
  on: string;
  minAge: number;
  licences: LicenceLike[];
  site: { locationId: string; state: string; name: string };
  licenceMax: number | null;
  activeUnderLicence: number;
  activeAtSite: number;
  threshold: number | null;
  duplicateAt: string | null;
}): WorkerCheck[] {
  const age = ageOn(i.dob, i.on);
  const lic = deployBlock(i.licences, { locationId: i.site.locationId, state: i.site.state, on: i.on });
  const full = i.licenceMax !== null && i.activeUnderLicence + 1 > i.licenceMax;
  const crossing = i.threshold !== null && i.activeAtSite + 1 >= i.threshold;
  return [
    { id: 'age', status: age >= i.minAge ? 'pass' : 'fail', label: `Age ${i.minAge} or over`, ...(age < i.minAge ? { detail: `The worker is ${age} on the first day. Deployment is not allowed.` } : {}) },
    { id: 'licence', status: lic ? 'fail' : 'pass', label: `Contractor licence valid at ${i.site.name} on the first day`, ...(lic ? { detail: lic } : {}) },
    { id: 'max', status: full ? 'fail' : 'pass', label: 'Within the licence maximum', ...(i.licenceMax !== null ? { detail: `Licence allows ${i.licenceMax} workers here; ${i.activeUnderLicence} are already deployed or waiting.` } : {}) },
    { id: 'dup', status: i.duplicateAt ? 'fail' : 'pass', label: 'Not already deployed', ...(i.duplicateAt ? { detail: `The same ID is already deployed or waiting at ${i.duplicateAt}.` } : { detail: 'Matched on the ID' }) },
    { id: 'threshold', status: crossing ? 'warn' : 'pass', label: 'Principal-employer registration threshold', ...(i.threshold !== null ? { detail: crossing ? `This makes ${i.activeAtSite + 1} contract workers at ${i.site.name}; registration is needed from ${i.threshold}. Make sure the site is registered.` : `${i.activeAtSite + 1} of ${i.threshold} before registration is needed.` } : {}) },
  ];
}
