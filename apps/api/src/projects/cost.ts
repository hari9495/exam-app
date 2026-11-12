// Projects P-5 (PRJ-04, founder answers 1412, 1413, 1445): the pure rules of project cost. Only totals leave the job.

export interface RateOf {
  /** Cost per hour in rupees (employer cost ÷ standard hours). */
  rate: number;
  /** The month's own final rate; false when the person's last final rate stands in (1413). */
  final: boolean;
}

/**
 * A project's cost for a month: each person's approved minutes times their rate, in whole paise. Basis is final only
 * when every person's rate is that month's own final rate; someone with no rate at all costs nothing and makes the
 * month provisional.
 */
export function monthCost(entries: { employeeId: string; minutes: number }[], rateFor: (employeeId: string) => RateOf | null) {
  let paise = 0;
  let final = true;
  const people = new Set<string>();
  let minutes = 0;
  for (const e of entries) {
    if (e.minutes <= 0) continue;
    people.add(e.employeeId);
    minutes += e.minutes;
    const r = rateFor(e.employeeId);
    if (!r || !r.final) final = false;
    if (r) paise += Math.round((e.minutes / 60) * r.rate * 100);
  }
  return { costPaise: paise, minutes, people: people.size, basis: final ? ('final' as const) : ('provisional' as const) };
}

/** Answer 1413: a provisional month that becomes final with another total keeps the old total to show the restatement. */
export function restatedFrom(prev: { basis: string; costPaise: bigint; restatedFromPaise: bigint | null } | null, next: { basis: 'final' | 'provisional'; costPaise: number }): bigint | null {
  if (!prev) return null;
  if (prev.basis === 'provisional' && next.basis === 'final' && prev.costPaise !== BigInt(next.costPaise)) return prev.costPaise;
  return prev.restatedFromPaise;
}

/** Answer 1412: cost is for Projects finance; a project's manager sees totals only for months with enough people. */
export const costShown = (p: { finance: boolean; manager: boolean; people: number; minPeople: number }) => p.finance || (p.manager && p.people >= p.minPeople);

/** Margin on revenue, whole per cent (null without revenue). */
export const marginPct = (revenuePaise: number, costPaise: number) => (revenuePaise > 0 ? Math.round(((revenuePaise - costPaise) / revenuePaise) * 100) : null);
