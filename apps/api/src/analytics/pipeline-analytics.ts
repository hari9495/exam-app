import type { StageCategory } from '@exam-platform/shared';

// Funnel steps only -- rejected/archived are terminal outcomes, not funnel progress.
export const CATEGORY_ORDER = ['active', 'offer', 'hired'] as const;

export interface EntryRow { category: StageCategory; rejected: boolean; enteredVia: string; createdAt: Date; updatedAt: Date; jobId: string; }
export interface JobMeta { title: string; status: string; }
export interface HiringFunnelRow { stage: string; reached: number; conversionFromPrev: number | null; }
export interface HiringTimeToHire { avgDays: number | null; medianDays: number | null; hiredCount: number; }
export interface HiringSourceRow { source: string; entered: number; hired: number; hireRate: number; }
export interface HiringJobRow { jobId: string; title: string; status: string; entered: number; hired: number; conversionPct: number; avgTimeToHireDays: number | null; }
export interface HiringAnalytics { funnel: HiringFunnelRow[]; timeToHire: HiringTimeToHire; sources: HiringSourceRow[]; jobs: HiringJobRow[]; }

const DAY_MS = 86_400_000;
const isHired = (e: EntryRow) => e.category === 'hired' && !e.rejected;
const categoryRank = (c: StageCategory) => CATEGORY_ORDER.indexOf(c as (typeof CATEGORY_ORDER)[number]);
const durationDays = (e: EntryRow) => (e.updatedAt.getTime() - e.createdAt.getTime()) / DAY_MS;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function computeHiringAnalytics(entries: EntryRow[], jobMeta: Map<string, JobMeta>): HiringAnalytics {
  // Funnel: reached[k] = count(categoryRank >= k) for active/offer; reached[hired] = count(isHired)
  const reached = CATEGORY_ORDER.map((_, k) =>
    k === CATEGORY_ORDER.length - 1
      ? entries.filter(isHired).length
      : entries.filter((e) => categoryRank(e.category) >= k).length,
  );
  const funnel: HiringFunnelRow[] = CATEGORY_ORDER.map((stage, k) => ({
    stage,
    reached: reached[k],
    conversionFromPrev: k === 0 ? null : reached[k - 1] === 0 ? null : reached[k] / reached[k - 1],
  }));

  const hiredDurations = entries.filter(isHired).map(durationDays);
  const timeToHire: HiringTimeToHire = { avgDays: avg(hiredDurations), medianDays: median(hiredDurations), hiredCount: hiredDurations.length };

  const bySource = new Map<string, EntryRow[]>();
  for (const e of entries) { (bySource.get(e.enteredVia) ?? bySource.set(e.enteredVia, []).get(e.enteredVia)!).push(e); }
  const sources: HiringSourceRow[] = [...bySource.entries()]
    .map(([source, rows]) => {
      const hired = rows.filter(isHired).length;
      return { source, entered: rows.length, hired, hireRate: rows.length === 0 ? 0 : hired / rows.length };
    })
    .sort((a, b) => b.hireRate - a.hireRate);

  const byJob = new Map<string, EntryRow[]>();
  for (const e of entries) { (byJob.get(e.jobId) ?? byJob.set(e.jobId, []).get(e.jobId)!).push(e); }
  const jobs: HiringJobRow[] = [...byJob.entries()].map(([jobId, rows]) => {
    const hiredRows = rows.filter(isHired);
    const meta = jobMeta.get(jobId);
    return {
      jobId,
      title: meta?.title ?? '(unknown)',
      status: meta?.status ?? 'unknown',
      entered: rows.length,
      hired: hiredRows.length,
      conversionPct: rows.length === 0 ? 0 : (hiredRows.length / rows.length) * 100,
      avgTimeToHireDays: avg(hiredRows.map(durationDays)),
    };
  });

  return { funnel, timeToHire, sources, jobs };
}
