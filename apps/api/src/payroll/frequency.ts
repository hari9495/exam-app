// Weekly and fortnightly pay calendars (M03 YX-PAY-58, PAY-9.01): periods of 7 or 14 days counted from the group's
// anchor date, cut at month ends so every run lies in one month (the month's returns add its runs up). Pure dates.

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface SubPeriod {
  /** 1 for the month's first period, then 2, 3 … */
  k: number;
  from: string;
  to: string;
  /** The run that ends the month (monthly items, PT, LWF and TDS go in it). */
  final: boolean;
}

/** The month's sub-periods of a weekly or fortnightly group whose periods start on `anchor` (YYYY-MM-DD). */
export function subPeriods(frequency: 'weekly' | 'fortnightly', anchor: string, month: string): SubPeriod[] {
  const len = frequency === 'weekly' ? 7 : 14;
  const first = at(`${month}-01`);
  const [y, m] = month.split('-').map(Number);
  const last = Date.UTC(y, m, 0);
  // The period that contains the 1st: the anchor moved by whole periods (backwards or forwards).
  const offset = Math.floor((first - at(anchor)) / DAY / len);
  let start = at(anchor) + offset * len * DAY;
  const out: SubPeriod[] = [];
  while (start <= last) {
    const end = start + (len - 1) * DAY;
    const from = Math.max(start, first);
    const to = Math.min(end, last);
    out.push({ k: out.length + 1, from: iso(from), to: iso(to), final: to === last });
    start += len * DAY;
  }
  return out;
}
