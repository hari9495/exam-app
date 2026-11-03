import { Prisma } from '@prisma/client';
import { istMonth, lastMonths, payMonthFor, prevMonth, teamFigures } from './home-rules';

const D = (x: string) => new Prisma.Decimal(x);

describe('expenses home rules (EXP-01)', () => {
  it('buckets by the IST month: 31 Oct 19:00 UTC is already 1 Nov in India', () => {
    expect(istMonth(new Date('2026-10-31T18:29:59Z'))).toBe('2026-10');
    expect(istMonth(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11');
  });

  it('counts months back across a year end', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(lastMonths('2026-02-10', 5)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('pays in this month up to and on the cut-off day, the next month after it (and over a year end)', () => {
    expect(payMonthFor('2026-11-23', 23)).toBe('2026-11');
    expect(payMonthFor('2026-11-24', 23)).toBe('2026-12');
    expect(payMonthFor('2026-12-24', 23)).toBe('2027-01');
    expect(payMonthFor('2026-02-28', 28)).toBe('2026-02');
  });

  it('adds the approved amount once decided, else the claimed amount, exactly', () => {
    const months = ['2026-10', '2026-11'];
    const claims = [
      { id: 'a', status: 'approved', submittedAt: new Date('2026-11-02T05:00:00Z'), claimedTotal: D('1000.10'), approvedTotal: D('900.20') },
      { id: 'b', status: 'submitted', submittedAt: new Date('2026-11-03T05:00:00Z'), claimedTotal: D('0.10'), approvedTotal: null },
      { id: 'c', status: 'partly_approved', submittedAt: new Date('2026-10-05T05:00:00Z'), claimedTotal: D('500.00'), approvedTotal: D('250.00') },
      { id: 'd', status: 'rejected', submittedAt: new Date('2026-11-05T05:00:00Z'), claimedTotal: D('99.00'), approvedTotal: D('0') },
      { id: 'e', status: 'draft', submittedAt: null, claimedTotal: D('77.00'), approvedTotal: null },
      { id: 'f', status: 'approved', submittedAt: new Date('2026-06-05T05:00:00Z'), claimedTotal: D('5.00'), approvedTotal: D('5.00') },
    ];
    const lines = [
      { claimId: 'a', policyResult: { outcome: 'over_justify' } },
      { claimId: 'a', policyResult: { outcome: 'ok' } },
      { claimId: 'b', policyResult: { outcome: 'blocked' } },
      { claimId: 'c', policyResult: { outcome: 'over_justify' } },
      { claimId: 'd', policyResult: { outcome: 'over_justify' } },
      { claimId: 'b', policyResult: null },
    ];
    expect(teamFigures(months, claims, lines)).toEqual({ month: '2026-11', spend: '900.30', previous: '250.00', trend: ['250.00', '900.30'], overLimit: 2, overLimitPrevious: 1 });
  });

  it('with no claims every figure is zero', () => {
    expect(teamFigures(['2026-11'], [], [])).toEqual({ month: '2026-11', spend: '0.00', previous: null, trend: ['0.00'], overLimit: 0, overLimitPrevious: null });
  });
});
