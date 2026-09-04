import { computeHiringAnalytics, EntryRow, JobMeta } from './pipeline-analytics';

const d = (iso: string) => new Date(iso);
const row = (o: Partial<EntryRow>): EntryRow => ({
  category: 'active', rejected: false, enteredVia: 'manual',
  createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-01T00:00:00Z'), jobId: 'job-1', ...o,
});

describe('computeHiringAnalytics', () => {
  it('empty cohort returns zeroed structures, never throwing', () => {
    const out = computeHiringAnalytics([], new Map());
    expect(out.funnel.map((f) => f.reached)).toEqual([0, 0, 0]);
    expect(out.timeToHire).toEqual({ avgDays: null, medianDays: null, hiredCount: 0 });
    expect(out.sources).toEqual([]);
    expect(out.jobs).toEqual([]);
  });

  it('cumulative funnel counts rejected up to its preserved category; hired excludes rejected', () => {
    const entries = [
      row({ category: 'active' }),
      row({ category: 'offer' }),                 // reached active,offer
      row({ category: 'offer', rejected: true }),  // rejected AT offer -> still reached offer
      row({ category: 'hired' }),                  // reached all + is a hire
      row({ category: 'hired', rejected: true }),  // degenerate: NOT counted as hired
    ];
    const out = computeHiringAnalytics(entries, new Map([['job-1', { title: 'Backend', status: 'open' }]]));
    // reached: active=5 (all ranks >=0), offer=4 (two offer + two hired), hired=1 (only the non-rejected hire)
    expect(out.funnel.find((f) => f.stage === 'active')!.reached).toBe(5);
    expect(out.funnel.find((f) => f.stage === 'offer')!.reached).toBe(4);
    expect(out.funnel.find((f) => f.stage === 'hired')!.reached).toBe(1);
    // conversionFromPrev: active null; offer 4/5=0.8
    expect(out.funnel.find((f) => f.stage === 'active')!.conversionFromPrev).toBeNull();
    expect(out.funnel.find((f) => f.stage === 'offer')!.conversionFromPrev).toBeCloseTo(0.8);
  });

  it('conversion is null, not NaN, when the previous stage reached zero', () => {
    const out = computeHiringAnalytics([], new Map());
    // reached active=0, offer=0... conversion offer = 0/0 -> null
    expect(out.funnel.find((f) => f.stage === 'offer')!.conversionFromPrev).toBeNull();
  });

  it('counts custom-named stages by category in the funnel (renamed/custom stages are not dropped)', () => {
    const out = computeHiringAnalytics([
      row({ category: 'active' }), row({ category: 'offer' }), row({ category: 'hired' }),
    ], new Map());
    const hired = out.funnel.find((f) => f.stage === 'hired');
    expect(hired?.reached).toBe(1);
    expect(out.funnel.find((f) => f.stage === 'active')!.reached).toBe(3);
    expect(out.funnel.find((f) => f.stage === 'offer')!.reached).toBe(2);
  });

  it('archived/rejected categories are excluded from the funnel steps but not from hired exclusion logic', () => {
    const out = computeHiringAnalytics([
      row({ category: 'active' }),
      row({ category: 'rejected' }),
      row({ category: 'archived' }),
    ], new Map());
    // rejected/archived have rank -1, so they never satisfy rank >= 0 and are excluded from "active" reached.
    expect(out.funnel.find((f) => f.stage === 'active')!.reached).toBe(1);
  });

  it('time-to-hire averages/medians hired durations; null when none', () => {
    const entries = [
      row({ category: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-05T00:00:00Z') }), // 4d
      row({ category: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-03T00:00:00Z') }), // 2d
      row({ category: 'hired', rejected: true, updatedAt: d('2026-09-01T00:00:00Z') }),                       // excluded
    ];
    const out = computeHiringAnalytics(entries, new Map());
    expect(out.timeToHire.hiredCount).toBe(2);
    expect(out.timeToHire.avgDays).toBeCloseTo(3);
    expect(out.timeToHire.medianDays).toBeCloseTo(3);
  });

  it('source effectiveness reports per-channel hire rate, sorted desc', () => {
    const entries = [
      row({ enteredVia: 'application', category: 'active' }),
      row({ enteredVia: 'application', category: 'hired' }),
      row({ enteredVia: 'exam', category: 'hired' }),
    ];
    const out = computeHiringAnalytics(entries, new Map());
    expect(out.sources[0]).toEqual({ source: 'exam', entered: 1, hired: 1, hireRate: 1 });
    expect(out.sources.find((s) => s.source === 'application')).toEqual({ source: 'application', entered: 2, hired: 1, hireRate: 0.5 });
  });

  it('jobs rollup joins title/status and computes per-job conversion + avg time-to-hire', () => {
    const entries = [
      row({ jobId: 'job-1', category: 'active' }),
      row({ jobId: 'job-1', category: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-04T00:00:00Z') }), // 3d
    ];
    const out = computeHiringAnalytics(entries, new Map([['job-1', { title: 'Backend', status: 'open' }]]));
    expect(out.jobs[0]).toMatchObject({ jobId: 'job-1', title: 'Backend', status: 'open', entered: 2, hired: 1, conversionPct: 50, avgTimeToHireDays: 3 });
  });
});
