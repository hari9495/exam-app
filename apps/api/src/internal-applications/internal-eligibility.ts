// HIR-13 (founder decision 6): who may apply for an internal job, and when. Pure, so every rule and boundary is unit
// tested; the service gathers the facts from People and the company settings.

/** The company's rules (settings hiring.internal.*, each with a default). */
export interface InternalRules {
  /** Only people whose probation is confirmed (default on). */
  afterProbation: boolean;
  /** Whole months in the current role before applying (default 12; 0 = no wait). */
  monthsInRole: number;
}

/** What People says about the person today (dates YYYY-MM-DD, India time). */
export interface InternalFacts {
  /** An employment that has not ended. */
  employed: boolean;
  /** The current employment status period: probation, confirmed or notice. */
  status: string | null;
  /** The planned end of the probation, when on probation. */
  probationEndsOn: string | null;
  /** The first day of the current role (the same designation without a break). */
  roleSince: string | null;
  today: string;
}

export type InternalEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'not_employee' | 'notice' | 'probation' | 'months'; title: string; detail: string; opensOn: string | null };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "1 Jan 2027" (the product's date format). */
export const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** `iso` + `n` calendar months, the day clamped to the month's last day (31 Jan + 1 = 28 Feb, as PostgreSQL does). */
export function addMonths(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const d = Math.min(Number(iso.slice(8, 10)), last);
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function internalEligibility(rules: InternalRules, f: InternalFacts): InternalEligibility {
  if (!f.employed) return { eligible: false, reason: 'not_employee', title: 'Internal jobs are for employees', detail: 'Your sign-in is not linked to a current employee record. Ask HR to link it if you work here.', opensOn: null };
  if (f.status === 'notice') return { eligible: false, reason: 'notice', title: 'You can’t apply while serving notice', detail: 'You are serving your notice period, so internal applications are closed for you.', opensOn: null };
  if (rules.afterProbation && f.status === 'probation') {
    const due = f.probationEndsOn;
    return {
      eligible: false,
      reason: 'probation',
      title: 'You can apply once your probation is confirmed',
      detail: due ? `Your probation is due to end on ${dayLabel(due)}. Internal applications open for you once it is confirmed (company rule).` : 'Internal applications open for you once your probation is confirmed (company rule).',
      opensOn: due,
    };
  }
  if (rules.monthsInRole > 0 && f.roleSince) {
    const opens = addMonths(f.roleSince, rules.monthsInRole);
    if (opens > f.today) {
      return {
        eligible: false,
        reason: 'months',
        title: `You can apply after ${rules.monthsInRole} months in your current role`,
        detail: `You started your current role on ${dayLabel(f.roleSince)}. Internal applications open for you on ${dayLabel(opens)} (company rule).`,
        opensOn: opens,
      };
    }
  }
  return { eligible: true };
}

/** The first day of the current role: walk back over the assignments (newest first) while the designation stays the same. */
export function roleSince(assignments: { validFrom: string; designationId: string }[]): string | null {
  const [cur, ...rest] = assignments;
  if (!cur) return null;
  let since = cur.validFrom;
  for (const a of rest) {
    if (a.designationId !== cur.designationId) break;
    since = a.validFrom;
  }
  return since;
}
