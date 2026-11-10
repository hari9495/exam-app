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
  id: 'age' | 'licence' | 'max' | 'dup' | 'threshold' | 'workorder';
  status: CheckStatus;
  label: string;
  detail?: string;
}

/**
 * The deployment checks (answer 635, law, no override): age on the first day at least the rule set's minimum; a verified
 * licence for the site in force on the day and covering its state (deployBlock); room under the licence maximum; the
 * same ID not pending or deployed anywhere. Answer 681: at the registration threshold a site without a registration is
 * blocked, and a registered site is blocked above the registration's maximum; nearing the threshold warns (answer 622)
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
  /** CL-5 (answers 622, 673, 681): the site's registration, and the share of the threshold that warns (80 %). */
  registration?: { maxWorkers: number } | null;
  warnPct?: number;
  duplicateAt: string | null;
  /** Answer 675: the contractor's work order covering the site on the day, and its deployments there. */
  workOrder?: { number: string; headcount: number; active: number } | null;
}): WorkerCheck[] {
  const age = ageOn(i.dob, i.on);
  const lic = deployBlock(i.licences, { locationId: i.site.locationId, state: i.site.state, on: i.on });
  const full = i.licenceMax !== null && i.activeUnderLicence + 1 > i.licenceMax;
  const n = i.activeAtSite + 1;
  const reg = i.registration ?? null;
  const warnAt = i.threshold !== null ? Math.ceil((i.threshold * (i.warnPct ?? 80)) / 100) : null;
  const threshold: WorkerCheck = reg
    ? n > reg.maxWorkers
      ? { id: 'threshold', status: 'fail', label: 'Within the principal-employer registration', detail: `The registration allows ${reg.maxWorkers} contract workers at ${i.site.name}; this makes ${n}. Amend the registration first.` }
      : { id: 'threshold', status: 'pass', label: 'Within the principal-employer registration', detail: `${n} of ${reg.maxWorkers} under the registration.` }
    : i.threshold !== null && n >= i.threshold
      ? { id: 'threshold', status: 'fail', label: 'Principal-employer registration threshold', detail: `This makes ${n} contract workers at ${i.site.name}; registration is needed from ${i.threshold}. Record the site's registration in Settings › Contract labour first.` }
      : warnAt !== null && n >= warnAt
        ? { id: 'threshold', status: 'warn', label: 'Principal-employer registration threshold', detail: `${n} of ${i.threshold} before registration is needed. Register the site soon.` }
        : { id: 'threshold', status: 'pass', label: 'Principal-employer registration threshold', ...(i.threshold !== null ? { detail: `${n} of ${i.threshold} before registration is needed.` } : {}) };
  return [
    { id: 'age', status: age >= i.minAge ? 'pass' : 'fail', label: `Age ${i.minAge} or over`, ...(age < i.minAge ? { detail: `The worker is ${age} on the first day. Deployment is not allowed.` } : {}) },
    { id: 'licence', status: lic ? 'fail' : 'pass', label: `Contractor licence valid at ${i.site.name} on the first day`, ...(lic ? { detail: lic } : {}) },
    { id: 'max', status: full ? 'fail' : 'pass', label: 'Within the licence maximum', ...(i.licenceMax !== null ? { detail: `Licence allows ${i.licenceMax} workers here; ${i.activeUnderLicence} are already deployed or waiting.` } : {}) },
    { id: 'dup', status: i.duplicateAt ? 'fail' : 'pass', label: 'Not already deployed', ...(i.duplicateAt ? { detail: `The same ID is already deployed or waiting at ${i.duplicateAt}.` } : { detail: 'Matched on the ID' }) },
    ...(i.workOrder
      ? [{ id: 'workorder' as const, status: (i.workOrder.active + 1 > i.workOrder.headcount ? 'warn' : 'pass') as CheckStatus, label: `Within work order ${i.workOrder.number}`, detail: i.workOrder.active + 1 > i.workOrder.headcount ? `The work order is for ${i.workOrder.headcount} workers; this makes ${i.workOrder.active + 1}. Amend the work order with the contractor.` : `${i.workOrder.active + 1} of ${i.workOrder.headcount} workers.` }]
      : []),
    threshold,
  ];
}

/* ---------------- CL-4: monthly proofs, the wage check and the payment hold (answers 626, 634) ---------------- */

export const PROOF_KINDS = ['pf_challan', 'esi_challan', 'wage_register', 'bank_proof'] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];
export type ProofState = 'submitted' | 'verified' | 'discrepancy';
export type PackStatus = 'open' | 'submitted' | 'verified' | 'discrepancy' | 'overdue';

/** The first day of the month of a day. */
export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

/** A month's proofs are due on the company's cut-off day of the following month (setting clra.doc_cutoff). */
export function packDue(month: string, cutoffDay: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(cutoffDay, last));
  return next.toISOString().slice(0, 10);
}

/**
 * Where a month's pack stands: a discrepancy on any proof wins; every proof verified is verified; past the due day with a
 * proof missing or not yet verified is overdue; all four in is submitted; otherwise open.
 */
export function packStatus(states: Partial<Record<ProofKind, ProofState>>, due: string, today: string): PackStatus {
  const s = PROOF_KINDS.map((k) => states[k]);
  if (s.includes('discrepancy')) return 'discrepancy';
  if (s.every((x) => x === 'verified')) return 'verified';
  if (today > due) return 'overdue';
  return s.every(Boolean) ? 'submitted' : 'open';
}

/** Answer 634: a month holds the contractor's bill while overdue or disputed, unless the compliance owner released it. */
export const holdsBill = (status: PackStatus, released: boolean) => !released && (status === 'overdue' || status === 'discrepancy');

/**
 * Answer 626, the wage check: what a worker had to be paid for the days in the register (the minimum daily rate times the
 * days, never more than the monthly rate), and the shortfall in paise (0 when paid enough).
 */
export function wageShortfall(i: { days: number; grossPaise: bigint; minDailyPaise: bigint; minMonthlyPaise: bigint }): { duePaise: bigint; shortPaise: bigint } {
  const byDays = i.minDailyPaise * BigInt(i.days);
  const due = byDays < i.minMonthlyPaise ? byDays : i.minMonthlyPaise;
  return { duePaise: due, shortPaise: i.grossPaise >= due ? 0n : due - i.grossPaise };
}

/** The recovery from a bill: what the company paid workers itself and has not recovered yet, never more than the bill. */
export function recoveryFrom(netPaise: bigint, pending: { id: string; leftPaise: bigint }[]): { totalPaise: bigint; take: { id: string; paise: bigint }[] } {
  let room = netPaise > 0n ? netPaise : 0n;
  const take: { id: string; paise: bigint }[] = [];
  for (const p of pending) {
    if (room <= 0n) break;
    const t = p.leftPaise < room ? p.leftPaise : room;
    if (t > 0n) take.push({ id: p.id, paise: t });
    room -= t;
  }
  return { totalPaise: take.reduce((n, t) => n + t.paise, 0n), take };
}

/** YX-CLRA-06 short challan: workers covered must be at least the workers deployed in the month. */
export const challanShortfall = (covered: number, onSite: number) => Math.max(0, onSite - covered);

/* ---------------- CL-5: attendance and the threshold peak (answers 622, 625, 742) ---------------- */

/**
 * Answer 622: the highest number of contract workers on any one day between `from` and `to` (both included), from the
 * deployments' first and last days. Returns the peak and its first day.
 */
export function peakOf(spans: { from: string; to: string | null }[], from: string, to: string): { peak: number; on: string | null } {
  const delta = new Map<string, number>();
  const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  for (const s of spans) {
    const a = s.from > from ? s.from : from;
    const b = s.to && s.to < to ? s.to : to;
    if (a > b) continue;
    delta.set(a, (delta.get(a) ?? 0) + 1);
    const after = next(b);
    delta.set(after, (delta.get(after) ?? 0) - 1);
  }
  let cur = 0;
  let best = { peak: 0, on: null as string | null };
  for (const d of [...delta.keys()].sort()) {
    cur += delta.get(d)!;
    if (d <= to && cur > best.peak) best = { peak: cur, on: d };
  }
  return best;
}

/** Answer 742: the wage register may not pay fewer days than the worker was on site (attendance). */
export const shortDays = (paidDays: number, presentDays: number) => Math.max(0, presentDays - paidDays);

