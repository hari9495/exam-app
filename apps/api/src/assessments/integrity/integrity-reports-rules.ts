// AS-5 part 3 (PRC-20): the pure parts of the integrity reports. They only point reviewers at attempts to look at;
// they never change a score.

/** One submitted attempt's wrong choice answers: question id -> the options chosen (sorted, joined). */
export interface WrongAnswers {
  attemptId: string;
  startedAt: Date | null;
  wrong: Map<string, string>;
}

export interface Cluster {
  attemptIds: string[];
  /** The most identical wrong answers any two of them share. */
  same: number;
  /** Minutes between the first and the last start, or null when a start is unknown. */
  startSpreadMinutes: number | null;
}

/**
 * Collusion: two attempts that chose the same wrong option on at least `minSame` questions are linked; linked attempts
 * form a cluster. A wrong answer chosen by many (more than `commonShare` of the attempts, at least 10) is a common
 * mistake, not a sign, and is left out.
 */
export function collusionClusters(attempts: WrongAnswers[], minSame: number, commonShare = 0.05): Cluster[] {
  const buckets = new Map<string, number[]>();
  attempts.forEach((a, i) => a.wrong.forEach((key, q) => (buckets.get(`${q}|${key}`) ?? buckets.set(`${q}|${key}`, []).get(`${q}|${key}`)!).push(i)));
  const common = Math.max(10, Math.ceil(attempts.length * commonShare));
  const pairs = new Map<number, number>();
  const n = attempts.length;
  for (const members of buckets.values()) {
    if (members.length < 2 || members.length > common) continue;
    for (let x = 0; x < members.length; x++) for (let y = x + 1; y < members.length; y++) pairs.set(members[x]! * n + members[y]!, (pairs.get(members[x]! * n + members[y]!) ?? 0) + 1);
  }
  const parent = attempts.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const best = new Map<number, number>();
  for (const [key, same] of pairs) {
    if (same < minSame) continue;
    const a = Math.floor(key / n);
    const b = key % n;
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent[rb] = ra;
    best.set(a, Math.max(best.get(a) ?? 0, same));
    best.set(b, Math.max(best.get(b) ?? 0, same));
  }
  const groups = new Map<number, number[]>();
  [...best.keys()].forEach((i) => (groups.get(root(i)) ?? groups.set(root(i), []).get(root(i))!).push(i));
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const starts = g.map((i) => attempts[i]!.startedAt);
      const known = starts.every((s): s is Date => s !== null);
      return {
        attemptIds: g.map((i) => attempts[i]!.attemptId),
        same: Math.max(...g.map((i) => best.get(i) ?? 0)),
        startSpreadMinutes: known ? Math.round((Math.max(...starts.map((s) => s.getTime())) - Math.min(...starts.map((s) => s.getTime()))) / 60_000) : null,
      };
    })
    .sort((a, b) => b.same - a.same || b.attemptIds.length - a.attemptIds.length);
}

/**
 * Inter-rater agreement: quadratic weighted kappa of two markers' marks on the same answers, each mark scaled to 0-10
 * of the question's marks. Null with fewer than 2 answers; 1 when the two always agree.
 */
export function weightedKappa(pairs: { a: number; b: number; max: number }[]): number | null {
  if (pairs.length < 2) return null;
  const K = 11;
  const bin = (m: number, max: number) => Math.min(K - 1, Math.max(0, Math.round((max > 0 ? m / max : 0) * (K - 1))));
  const O = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  pairs.forEach((p) => O[bin(p.a, p.max)]![bin(p.b, p.max)]!++);
  const rows = O.map((r) => r.reduce((s, v) => s + v, 0));
  const cols = O[0]!.map((_, j) => O.reduce((s, r) => s + r[j]!, 0));
  const n = pairs.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < K; i++)
    for (let j = 0; j < K; j++) {
      const w = (i - j) ** 2 / (K - 1) ** 2;
      num += w * O[i]![j]!;
      den += (w * rows[i]! * cols[j]!) / n;
    }
  if (num === 0) return 1;
  return den === 0 ? null : Math.round((1 - num / den) * 100) / 100;
}

/** "W47" style week label (ISO week) for the agreement chart. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `W${Math.ceil(((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7)}`;
}

/** "Started within 12 min" / "Started 3 h apart" / "Start time unknown". */
export function timingText(spread: number | null): string {
  if (spread === null) return 'Start time unknown';
  if (spread <= 60) return `Started within ${spread} min`;
  return `Started ${Math.round(spread / 60)} h apart`;
}
