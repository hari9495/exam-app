// Performance batch PM6 (M06-BUILD-DESIGN §11, §13; Q5, YX-PERF-08): the pure rules of calibration and reports.
// The guide is a guide only: it never blocks sign-off and never moves anyone. Unit-tested in calibration-rules.spec.ts.

export type GuideBand = { label: string; share: number };
export type Guide = { bands: GuideBand[]; tolerance: number };
export type BoardRow = { band: string | null; protectedLeave: boolean };
export type Distribution = {
  /** Null when the group is too small to show a chart without pointing at people. */
  bands: { label: string; count: number; share: number; target: number | null; outside: boolean }[] | null;
  counted: number;
  notes: string[];
};

/** Shares add up to 100 and each is between 0 and 100; the tolerance is 0–50 points. */
export function guideProblem(g: Guide, labels: readonly string[]): string | null {
  if (g.tolerance < 0 || g.tolerance > 50) return 'The tolerance is between 0 and 50 points.';
  for (const b of g.bands) {
    if (!labels.includes(b.label)) return `${b.label} is not a band of this scale.`;
    if (b.share < 0 || b.share > 100) return `The share for ${b.label} is between 0 and 100.`;
  }
  const total = g.bands.reduce((t, b) => t + Math.round(b.share * 100), 0);
  if (g.bands.length && total !== 10_000) return `The shares add up to ${total / 100}, not 100.`;
  return null;
}

/**
 * §11.2: the actual distribution next to the guide. People on protected leave are not counted (J11); a group smaller
 * than `minGroup` shows no chart, only the list; a band outside the tolerance gets a soft note, never a block.
 */
export function distribution(rows: readonly BoardRow[], labels: readonly string[], guide: Guide | null, minGroup: number): Distribution {
  const counted = rows.filter((r) => !r.protectedLeave && r.band);
  if (counted.length < minGroup) return { bands: null, counted: counted.length, notes: [] };
  const notes: string[] = [];
  const bands = labels.map((label) => {
    const count = counted.filter((r) => r.band === label).length;
    const share = Math.round((count / counted.length) * 1000) / 10;
    const target = guide?.bands.find((b) => b.label === label)?.share ?? null;
    const outside = target !== null && Math.abs(share - target) > (guide?.tolerance ?? 0);
    if (outside) notes.push(`${label}: ${share}% against a guide of ${target}%.`);
    return { label, count, share, target, outside };
  });
  return { bands, counted: counted.length, notes };
}

/** YX-PERF-08: a change needs a reason, and a new score inside the scale. */
export function changeProblem(p: { from: number | null; to: number; min: number; max: number; reason: string }): string | null {
  if (p.to < p.min || p.to > p.max) return `The score is between ${p.min} and ${p.max}.`;
  if (p.from !== null && Math.round(p.from * 100) === Math.round(p.to * 100)) return 'That is the score it already has.';
  if (p.reason.trim().length < 3) return 'Give the reason for the change.';
  return null;
}

/** Reports: a cell with fewer than `min` people is suppressed (shown as null), so no one is singled out. */
export function suppress<T extends { count: number }>(cells: readonly T[], min: number): (T | (Omit<T, 'count'> & { count: null; suppressed: true }))[] {
  return cells.map((c) => (c.count > 0 && c.count < min ? { ...c, count: null, suppressed: true as const } : c));
}

/** A CSV cell: quoted when it has a comma, quote or line break; formula-looking text is defused (CSV injection). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: readonly string[], rows: readonly unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
