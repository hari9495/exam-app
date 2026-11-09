import type { AllReferral, CostEntry, Referral } from '@yukthix/ui/hiring';

// HIR-11 / HIR-12 glue: API rows to the designed screens' rows. Pure, so it is unit-tested. Months and days are India
// time (the one live region); money stays in rupees as the API sends it.

export interface ApiCost {
  id: string;
  source: string;
  costType: string;
  jobId: string | null;
  jobTitle: string | null;
  amount: number | string;
  period: string | null;
  origin: string;
  note: string | null;
  enteredByName: string | null;
  createdAt: string;
}

export interface ApiReferral {
  id: string;
  candidateName: string;
  jobTitle: string;
  stage: Referral['stage'];
  joinedOn: string | null;
  bonusInr: number;
  rewardStatus: string;
  createdAt: string;
  eligibleOn: string | null;
  bonusDue: AllReferral['bonus'];
  referrerName?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** A calendar day (YYYY-MM-DD) as a local Date, for formatDate. */
export const dayToDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

const TYPE: Record<string, CostEntry['type']> = { job_board: 'Job board', posting: 'Job board', agency_fee: 'Agency fee', referral_bonus: 'Referral bonus', assessment: 'Assessment', event: 'Event' };
const ORIGIN: Record<string, CostEntry['origin']> = { manual: 'Manual', payroll: 'Payroll one-time pay', assessment: 'Assessment cost' };

export function costRow(c: ApiCost): CostEntry {
  // A cost recorded before months were asked for counts in the month it was entered (India time).
  const month = (c.period ?? istDay(new Date(c.createdAt))).slice(0, 7);
  const origin = ORIGIN[c.origin] ?? 'Manual';
  return {
    id: c.id,
    period: monthLabel(month),
    month,
    job: c.jobTitle,
    jobId: c.jobId,
    source: c.source,
    type: TYPE[c.costType] ?? 'Other',
    amount: Number(c.amount),
    origin,
    enteredBy: c.enteredByName ?? (origin === 'Manual' ? 'Unknown' : 'System'),
    ...(c.note ? { note: c.note } : {}),
  };
}

/** The months a cost can be for: every month of the current quarter, India time (founder answer 206). */
export function costMonths(now: Date): { value: string; label: string }[] {
  const [y, m] = istDay(now).split('-').map(Number) as [number, number];
  const first = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => ({ value: `${y}-${String(first + i).padStart(2, '0')}`, label: MONTHS[first + i - 1]! }));
}

/** This month in India time (YYYY-MM): the Segment starts on it. */
export const thisMonth = (now = new Date()) => istDay(now).slice(0, 7);

/** "Oct–Dec 2026" and its three months, from the API's quarter (first and last day). */
export function quarterOf(from: string, to: string): { label: string; months: string[] } {
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7));
  const months = [0, 1, 2].map((i) => `${y}-${String(m + i).padStart(2, '0')}`);
  return { label: `${MONTHS[m - 1]}–${MONTHS[Number(to.slice(5, 7)) - 1]} ${to.slice(0, 4)}`, months };
}

export function referralRow(r: ApiReferral): Referral {
  return {
    id: r.id,
    name: r.candidateName,
    job: r.jobTitle,
    referred: dayToDate(istDay(new Date(r.createdAt))),
    stage: r.stage,
    joined: r.joinedOn ? dayToDate(r.joinedOn) : null,
    bonus: r.bonusInr,
    ...(r.rewardStatus === 'paid' ? { paid: true } : {}),
    ...(r.bonusDue === 'left' ? { leftEarly: true } : {}),
  };
}

/** HR's All referrals row (founder answer 204). */
export function allReferralRow(r: ApiReferral): AllReferral {
  return {
    id: r.id,
    name: r.candidateName,
    job: r.jobTitle,
    referrer: r.referrerName ?? 'Unknown',
    referred: dayToDate(istDay(new Date(r.createdAt))),
    stage: r.stage,
    bonus: r.bonusDue,
    dueOn: r.eligibleOn ? dayToDate(r.eligibleOn) : null,
    amount: r.bonusInr,
  };
}

/** Today in India as a local Date (for the bonus countdown). */
export const todayInIndia = (now = new Date()) => dayToDate(istDay(now));
