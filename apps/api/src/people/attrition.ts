// T2-G 47 (answer 2747): headcount and attrition. Headcount is counted on the last day of each month (people employed
// that day, not those whose last day it was); attrition = exits in the period ÷ average month-end headcount. Voluntary
// = the person resigned or took VRS (the exit case was started by the employee); involuntary = the company ended it;
// an exit with no exit case (imported) is "not recorded". Split by legal entity, department, location or grade, a group
// whose average headcount is under 5 shows no numbers (as survey results do), so no one person can be singled out.

export const MIN_GROUP = 5;
export const SPLITS = ['entity', 'department', 'location', 'grade'] as const;
export type Split = (typeof SPLITS)[number];

/** One month-end headcount row: the month's last day and the person's place that day. */
export interface HeadRow {
  day: string;
  entity: string | null;
  department: string | null;
  location: string | null;
  grade: string | null;
}
/** One exit in the period: the place on the last day, and who started it (null: no exit case). */
export interface ExitRow extends Omit<HeadRow, 'day'> {
  initiatedBy: 'employee' | 'company' | null;
}

export interface Figures {
  avgHeadcount: number;
  exits: number;
  voluntary: number;
  involuntary: number;
  notRecorded: number;
  /** Per cent, one decimal; null when there was nobody to count. */
  rate: number | null;
  voluntaryRate: number | null;
}

/** The last day of each month from `from` to `to` (YYYY-MM, inclusive). */
export function monthEnds(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function figures(days: readonly string[], heads: readonly HeadRow[], exits: readonly ExitRow[]): Figures {
  const avg = days.length ? heads.length / days.length : 0;
  const voluntary = exits.filter((e) => e.initiatedBy === 'employee').length;
  const involuntary = exits.filter((e) => e.initiatedBy === 'company').length;
  return {
    avgHeadcount: Math.round(avg * 10) / 10,
    exits: exits.length,
    voluntary,
    involuntary,
    notRecorded: exits.length - voluntary - involuntary,
    rate: pct(exits.length, avg),
    voluntaryRate: pct(voluntary, avg),
  };
}

export type GroupFigures = { id: string | null; hidden: false } & Figures;
export type HiddenGroup = { id: string | null; hidden: true };

/** The split: each group's figures, or hidden when its average headcount is under MIN_GROUP. */
export function splitBy(split: Split, days: readonly string[], heads: readonly HeadRow[], exits: readonly ExitRow[]): (GroupFigures | HiddenGroup)[] {
  const ids = [...new Set([...heads.map((h) => h[split]), ...exits.map((e) => e[split])])];
  return ids.map((id) => {
    const f = figures(days, heads.filter((h) => h[split] === id), exits.filter((e) => e[split] === id));
    return f.avgHeadcount < MIN_GROUP ? { id, hidden: true as const } : { id, hidden: false as const, ...f };
  });
}
