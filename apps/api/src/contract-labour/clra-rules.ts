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
