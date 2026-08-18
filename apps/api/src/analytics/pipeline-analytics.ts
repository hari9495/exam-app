export const STAGE_ORDER = ['applied', 'screened', 'interview', 'offer', 'hired'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export interface EntryRow { stage: string; rejected: boolean; enteredVia: string; createdAt: Date; updatedAt: Date; jobId: string; }
export interface JobMeta { title: string; status: string; }
export interface HiringFunnelRow { stage: string; reached: number; conversionFromPrev: number | null; }
export interface HiringTimeToHire { avgDays: number | null; medianDays: number | null; hiredCount: number; }
export interface HiringSourceRow { source: string; entered: number; hired: number; hireRate: number; }
export interface HiringJobRow { jobId: string; title: string; status: string; entered: number; hired: number; conversionPct: number; avgTimeToHireDays: number | null; }
export interface HiringAnalytics { funnel: HiringFunnelRow[]; timeToHire: HiringTimeToHire; sources: HiringSourceRow[]; jobs: HiringJobRow[]; }

const DAY_MS = 86_400_000;
const isHired = (e: EntryRow) => e.stage === 'hired' && !e.rejected;
const stageIndex = (s: string) => STAGE_ORDER.indexOf(s as Stage);
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
  // Funnel: reached[k] = count(stageIndex >= k) for k<4; reached[hired] = count(isHired)
  const reached = STAGE_ORDER.map((_, k) =>
    k === STAGE_ORDER.length - 1
      ? entries.filter(isHired).length
      : entries.filter((e) => stageIndex(e.stage) >= k).length,
  );
  const funnel: HiringFunnelRow[] = STAGE_ORDER.map((stage, k) => ({
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
