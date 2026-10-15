// Performance batch PM7 (M06-BUILD-DESIGN §12; Q6, YX-PERF-10, YX-PERF-18, PAY-39): the pure rules of the comp review.
// Money is handled in paise (integers) so sums never drift. Unit-tested in comp-rules.spec.ts.

export type Cell = { band: string; compaFrom: number | null; compaTo: number | null; minPct: number; targetPct: number; maxPct: number };

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Compa-ratio: current annual pay over the grade range's midpoint; null without a range (the matrix then uses the rating only). */
export function compaRatio(currentCtc: number, mid: number | null): number | null {
  if (!mid || mid <= 0) return null;
  return Math.round((currentCtc / mid) * 1000) / 1000;
}

/**
 * Cells tile the axis per band: compa-ratio ranges from nothing (null) to nothing (null) with no gap or overlap, in
 * order; percentages are min ≤ target ≤ max and never negative. A rating-only matrix has one cell per band.
 */
export function matrixProblem(axis: 'compa_ratio' | 'rating_only', bands: readonly string[], cells: readonly Cell[]): string | null {
  for (const c of cells) {
    if (!bands.includes(c.band)) return `${c.band} is not a band of the scale.`;
    if (c.minPct < 0 || c.minPct > c.targetPct || c.targetPct > c.maxPct || c.maxPct > 100) return `In ${c.band}, the percentages go minimum ≤ target ≤ maximum, between 0 and 100.`;
  }
  for (const b of bands) {
    const mine = cells.filter((c) => c.band === b).sort((x, y) => (x.compaFrom ?? -1) - (y.compaFrom ?? -1));
    if (!mine.length) return `${b} has no cell.`;
    if (axis === 'rating_only') {
      if (mine.length > 1 || mine[0].compaFrom !== null || mine[0].compaTo !== null) return `${b} needs one cell for every compa-ratio.`;
      continue;
    }
    if (mine[0].compaFrom !== null) return `${b} needs a first cell starting from any compa-ratio.`;
    if (mine[mine.length - 1].compaTo !== null) return `${b} needs a last cell open at the top.`;
    for (let i = 1; i < mine.length; i++) {
      if (mine[i - 1].compaTo === null || mine[i].compaFrom !== mine[i - 1].compaTo) return `${b}: the compa-ratio ranges leave a gap or overlap at ${mine[i - 1].compaTo ?? '…'}.`;
    }
  }
  return null;
}

/** The cell for a band and compa-ratio: compaFrom ≤ ratio < compaTo; without a ratio, the band's middle cell (Q6). */
export function cellFor(cells: readonly Cell[], band: string, ratio: number | null): Cell | null {
  const mine = cells.filter((c) => c.band === band).sort((x, y) => (x.compaFrom ?? -1) - (y.compaFrom ?? -1));
  if (!mine.length) return null;
  if (ratio === null) return mine[Math.floor((mine.length - 1) / 2)];
  return mine.find((c) => (c.compaFrom === null || ratio >= c.compaFrom) && (c.compaTo === null || ratio < c.compaTo)) ?? null;
}

/** The starting merit: the cell's target %, prorated by eligible months (protected leave already counts as served). */
export function meritFor(currentCtc: number, cell: Cell | null, proration: number): { pct: number; amount: number } {
  if (!cell) return { pct: 0, amount: 0 };
  const pct = round2(cell.targetPct * proration);
  return { pct, amount: rupees(Math.round((paise(currentCtc) * pct) / 100)) };
}

/** YX-PERF-10: outside the cell's range (after proration of the range), or a promotion, needs a justification and an extra step. */
export function outOfRange(pct: number, cell: Cell | null, proration: number, promotion: boolean): boolean {
  if (promotion) return true;
  if (!cell) return pct > 0;
  return pct < round2(cell.minPct * proration) - 0.001 || pct > round2(cell.maxPct * proration) + 0.001;
}

/** §12.4: used and remaining of a budget, in rupees. */
export function budgetUse(amount: number, used: readonly number[]): { used: number; remaining: number; over: boolean } {
  const u = used.reduce((t, x) => t + paise(x), 0);
  return { used: rupees(u), remaining: rupees(paise(amount) - u), over: u > paise(amount) };
}

/**
 * §12.3: each person's share = target bonus × the band's multiplier, scaled so the department's shares add up to the
 * pool exactly (the last paise go to the largest shares, in a fixed order).
 */
export function splitPool(pool: number, people: readonly { id: string; target: number; multiplier: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const weights = people.map((p) => ({ id: p.id, w: Math.max(0, p.target * p.multiplier) }));
  const total = weights.reduce((t, x) => t + x.w, 0);
  if (!total || pool <= 0) {
    for (const p of people) out.set(p.id, 0);
    return out;
  }
  const P = paise(pool);
  const raw = weights.map((x) => ({ id: x.id, exact: (P * x.w) / total }));
  let given = 0;
  for (const r of raw) {
    const v = Math.floor(r.exact);
    out.set(r.id, v);
    given += v;
  }
  const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.id.localeCompare(b.id));
  for (let i = 0; i < P - given; i++) out.set(order[i % order.length].id, out.get(order[i % order.length].id)! + 1);
  for (const [k, v] of out) out.set(k, rupees(v));
  return out;
}

/** PAY-39: where a person's pay sits in their grade's range. */
export function bandPosition(ctc: number, range: { min: number; mid: number; max: number }): { position: 'below' | 'within' | 'above'; quartile: 1 | 2 | 3 | 4 | null } {
  if (ctc < range.min) return { position: 'below', quartile: null };
  if (ctc > range.max) return { position: 'above', quartile: null };
  const span = range.max - range.min || 1;
  const q = Math.min(4, Math.floor(((ctc - range.min) / span) * 4) + 1) as 1 | 2 | 3 | 4;
  return { position: 'within', quartile: q };
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * YX-PERF-18: the pay gap by a dimension (gender, grade, location…), mean and median, against the overall figure.
 * A group under `min` people is suppressed. "adjusted" compares within the same grade (the gap left after grade).
 */
export function payGap(rows: readonly { group: string; grade: string; pay: number }[], min: number) {
  const groups = [...new Set(rows.map((r) => r.group))].sort();
  const all = rows.map((r) => r.pay);
  const allMean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  const allMedian = all.length ? median(all) : 0;
  return groups.map((g) => {
    const mine = rows.filter((r) => r.group === g);
    if (mine.length < min) return { group: g, count: null, suppressed: true as const };
    const pays = mine.map((r) => r.pay);
    const mean = pays.reduce((a, b) => a + b, 0) / pays.length;
    // Adjusted: each person against their grade's median, averaged.
    const adj = mine.map((r) => {
      const peers = rows.filter((x) => x.grade === r.grade).map((x) => x.pay);
      return peers.length ? r.pay / median(peers) - 1 : 0;
    });
    return {
      group: g,
      count: mine.length,
      suppressed: false as const,
      meanGapPct: allMean ? round2((mean / allMean - 1) * 100) : 0,
      medianGapPct: allMedian ? round2((median(pays) / allMedian - 1) * 100) : 0,
      adjustedGapPct: round2((adj.reduce((a, b) => a + b, 0) / adj.length) * 100),
    };
  });
}

/** People more than `pct` below their grade-and-role median are flagged for the reviewer; nothing changes by itself. */
export function belowMedian(rows: readonly { id: string; grade: string; role: string; pay: number }[], pct: number): string[] {
  return rows.filter((r) => {
    const peers = rows.filter((x) => x.grade === r.grade && x.role === r.role).map((x) => x.pay);
    return peers.length > 1 && r.pay < median(peers) * (1 - pct / 100);
  }).map((r) => r.id);
}
