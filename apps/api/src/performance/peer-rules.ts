// Performance batch PM5 (M06-BUILD-DESIGN §10.2; Q4, YX-PERF-05): how anonymous peer and report feedback is shown.
// Unit-tested in peer-rules.spec.ts.

export type Relationship = 'peer' | 'report' | 'other';
export type PeerEntry = { id: string; relationship: Relationship; answers: Record<string, { rating?: number | null; text?: string | null }>; comment: string | null };
export type ShownGroup = {
  group: 'peer' | 'report' | 'others';
  responses: number;
  /** Per question: the group's average and range, never a person's rating. */
  ratings: Record<string, { average: number; low: number; high: number; count: number }>;
  /** Texts and comments in an order unrelated to who wrote them or when. */
  texts: string[];
};
export type Grouped = { shown: ShownGroup[]; heldBack: number };

const LABEL = { peer: 'peer', report: 'report', other: 'others' } as const;

/** A fixed order that says nothing about the writer or the time: by a hash of the text. */
function scramble(texts: string[]): string[] {
  const h = (t: string) => [...t].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return [...texts].sort((a, b) => h(a) - h(b) || a.localeCompare(b));
}

function summarise(group: ShownGroup['group'], rows: readonly PeerEntry[]): ShownGroup {
  const ratings: ShownGroup['ratings'] = {};
  const texts: string[] = [];
  for (const r of rows) {
    for (const [q, a] of Object.entries(r.answers)) {
      if (typeof a.rating === 'number') {
        const cur = ratings[q] ?? { average: 0, low: a.rating, high: a.rating, count: 0 };
        cur.average += a.rating;
        cur.low = Math.min(cur.low, a.rating);
        cur.high = Math.max(cur.high, a.rating);
        cur.count += 1;
        ratings[q] = cur;
      }
      if (a.text?.trim()) texts.push(a.text.trim());
    }
    if (r.comment?.trim()) texts.push(r.comment.trim());
  }
  for (const v of Object.values(ratings)) v.average = Math.round((v.average / v.count) * 100) / 100;
  return { group, responses: rows.length, ratings, texts: scramble(texts) };
}

/**
 * §10.2: a relationship group is shown only with at least `min` submitted responses. Smaller groups merge into
 * "Others"; if that still falls short, it is held back and only its size is known ("not enough responses to show").
 */
export function groupFeedback(entries: readonly PeerEntry[], min: number): Grouped {
  const floor = Math.max(3, min);
  const by = (r: Relationship) => entries.filter((e) => e.relationship === r);
  const shown: ShownGroup[] = [];
  const pool: PeerEntry[] = [...by('other')];
  for (const r of ['peer', 'report'] as const) {
    const rows = by(r);
    if (rows.length >= floor) shown.push(summarise(LABEL[r], rows));
    else pool.push(...rows);
  }
  if (pool.length >= floor) return { shown: [...shown, summarise('others', pool)], heldBack: 0 };
  return { shown, heldBack: pool.length };
}

/** Nominations stay within the cycle's minimum and maximum; the employee cannot nominate past the maximum. */
export function nominationProblem(p: { approved: number; proposed: number; max: number; adding: 'propose' | 'approve' }): string | null {
  if (p.adding === 'propose' && p.approved + p.proposed >= p.max) return `Up to ${p.max} people can give feedback in this cycle.`;
  if (p.adding === 'approve' && p.approved >= p.max) return `${p.max} people are already approved, the most this cycle allows.`;
  return null;
}
