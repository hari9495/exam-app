import { computeHiringAnalytics, EntryRow, JobMeta } from './pipeline-analytics';

const d = (iso: string) => new Date(iso);
const row = (o: Partial<EntryRow>): EntryRow => ({
  stage: 'applied', rejected: false, enteredVia: 'manual',
  createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-01T00:00:00Z'), jobId: 'job-1', ...o,
});

describe('computeHiringAnalytics', () => {
  it('empty cohort returns zeroed structures, never throwing', () => {
    const out = computeHiringAnalytics([], new Map());
    expect(out.funnel.map((f) => f.reached)).toEqual([0, 0, 0, 0, 0]);
    expect(out.timeToHire).toEqual({ avgDays: null, medianDays: null, hiredCount: 0 });
    expect(out.sources).toEqual([]);
    expect(out.jobs).toEqual([]);
  });

  it('cumulative funnel counts rejected up to its preserved stage; hired excludes rejected', () => {
    const entries = [
      row({ stage: 'applied' }),
      row({ stage: 'interview' }),                 // reached applied,screened,interview
      row({ stage: 'interview', rejected: true }), // rejected AT interview -> still reached interview
      row({ stage: 'hired' }),                     // reached all + is a hire
      row({ stage: 'hired', rejected: true }),     // degenerate: NOT counted as hired
    ];
    const out = computeHiringAnalytics(entries, new Map([['job-1', { title: 'Backend', status: 'open' }]]));
    // reached: applied=5, screened=4 (idx>=1: two interviews, two hired), interview=4, offer=2 (two hired), hired=1 (only the non-rejected hire)
    expect(out.funnel.find((f) => f.stage === 'applied')!.reached).toBe(5);
    expect(out.funnel.find((f) => f.stage === 'screened')!.reached).toBe(4);
    expect(out.funnel.find((f) => f.stage === 'interview')!.reached).toBe(4);
    expect(out.funnel.find((f) => f.stage === 'offer')!.reached).toBe(2);
    expect(out.funnel.find((f) => f.stage === 'hired')!.reached).toBe(1);
    // conversionFromPrev: applied null; screened 4/5=0.8
    expect(out.funnel.find((f) => f.stage === 'applied')!.conversionFromPrev).toBeNull();
    expect(out.funnel.find((f) => f.stage === 'screened')!.conversionFromPrev).toBeCloseTo(0.8);
  });

  it('conversion is null, not NaN, when the previous stage reached zero', () => {
    const out = computeHiringAnalytics([row({ stage: 'applied' })], new Map());
    // reached applied=1, screened=0, interview=0... conversion screened = 0/1 = 0; interview = 0/0 -> null
    expect(out.funnel.find((f) => f.stage === 'interview')!.conversionFromPrev).toBeNull();
  });

  it('time-to-hire averages/medians hired durations; null when none', () => {
    const entries = [
      row({ stage: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-05T00:00:00Z') }), // 4d
      row({ stage: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-03T00:00:00Z') }), // 2d
      row({ stage: 'hired', rejected: true, updatedAt: d('2026-09-01T00:00:00Z') }),                       // excluded
    ];
    const out = computeHiringAnalytics(entries, new Map());
    expect(out.timeToHire.hiredCount).toBe(2);
    expect(out.timeToHire.avgDays).toBeCloseTo(3);
    expect(out.timeToHire.medianDays).toBeCloseTo(3);
  });

  it('source effectiveness reports per-channel hire rate, sorted desc', () => {
    const entries = [
      row({ enteredVia: 'application', stage: 'applied' }),
      row({ enteredVia: 'application', stage: 'hired' }),
      row({ enteredVia: 'exam', stage: 'hired' }),
    ];
    const out = computeHiringAnalytics(entries, new Map());
    expect(out.sources[0]).toEqual({ source: 'exam', entered: 1, hired: 1, hireRate: 1 });
    expect(out.sources.find((s) => s.source === 'application')).toEqual({ source: 'application', entered: 2, hired: 1, hireRate: 0.5 });
  });

  it('jobs rollup joins title/status and computes per-job conversion + avg time-to-hire', () => {
    const entries = [
      row({ jobId: 'job-1', stage: 'applied' }),
      row({ jobId: 'job-1', stage: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-04T00:00:00Z') }), // 3d
    ];
    const out = computeHiringAnalytics(entries, new Map([['job-1', { title: 'Backend', status: 'open' }]]));
    expect(out.jobs[0]).toMatchObject({ jobId: 'job-1', title: 'Backend', status: 'open', entered: 2, hired: 1, conversionPct: 50, avgTimeToHireDays: 3 });
  });
});
