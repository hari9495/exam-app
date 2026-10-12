import { incentive, layoffComp, oncall, pieceRate, settlementArrears, tipShares, unionDues, vrsSplit } from './special';

describe('batch 5i calculators', () => {
  const cards = [
    { operationCode: 'STITCH', rate: '2.50', validFrom: '2026-04-01', validTo: '2026-09-30' },
    { operationCode: 'STITCH', rate: '3.00', validFrom: '2026-10-01', validTo: null },
  ];

  it('piece-rate: the rate on each output date; a minimum-wage top-up for the days worked', () => {
    const r = pieceRate(cards, [{ workDate: '2026-09-30', operationCode: 'STITCH', quantity: '100' }, { workDate: '2026-10-01', operationCode: 'STITCH', quantity: '100' }], '600');
    expect(r.earnings.toFixed(2)).toBe('550.00');
    // Two days at 600 a day is 1,200: 650 tops it up.
    expect(r.topUp.toFixed(2)).toBe('650.00');
    expect(() => pieceRate(cards, [{ workDate: '2026-03-31', operationCode: 'STITCH', quantity: '1' }], '0')).toThrow(/No piece rate/);
  });

  it('incentive: 120 % of quota with an accelerator above 100 % pays 1.3 × target; a threshold pays nothing below it; the cap holds', () => {
    const plan = { targetAmount: '10000', tiers: [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], capPercent: null };
    expect(incentive(plan, '100', '120').amount.toFixed(2)).toBe('13000.00');
    const threshold = { targetAmount: '10000', tiers: [{ from: 0, multiplier: 0 }, { from: 50, multiplier: 2 }], capPercent: '150' };
    expect(incentive(threshold, '100', '40').amount.toFixed(2)).toBe('0.00');
    expect(incentive(threshold, '100', '90').amount.toFixed(2)).toBe('8000.00');
    expect(incentive(threshold, '100', '200')).toMatchObject({ capped: true });
    expect(incentive(threshold, '100', '200').amount.toFixed(2)).toBe('15000.00');
  });

  it('tips: shared by basis; the paise left go to the largest share, so the pool is paid exactly', () => {
    const s = tipShares('1000.00', [{ employmentId: 'a', basis: '1' }, { employmentId: 'b', basis: '1' }, { employmentId: 'c', basis: '1' }]);
    expect(s.map((x) => x.amount.toFixed(2))).toEqual(['333.34', '333.33', '333.33']);
  });

  it('on-call: a 1-hour call-out with a 3-hour minimum pays 3 hours, plus standby for every slot', () => {
    const r = oncall({ standbyAmount: '500', calloutMinHours: '3', calloutRate: '200', multiplier: '1.5' }, [{ calloutHours: '1' }, { calloutHours: null }]);
    expect(r).toMatchObject({ callouts: 1 });
    expect(r.standby.toFixed(2)).toBe('1000.00');
    expect(r.callout.toFixed(2)).toBe('900.00');
  });

  it('IR pay: dues fixed or per cent; lay-off at the share; settlement arrears by month; the VRS lifetime limit', () => {
    expect(unionDues({ duesKind: 'fixed', duesValue: '50' }, '20000').toFixed(2)).toBe('50.00');
    expect(unionDues({ duesKind: 'percent', duesValue: '1' }, '20000').toFixed(2)).toBe('200.00');
    expect(layoffComp('0.5', '15000', '6', 30).toFixed(2)).toBe('1500.00');
    const a = settlementArrears('1500', '2026-04-01', '2026-07');
    expect(a.months.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(a.total.toFixed(2)).toBe('4500.00');
    expect(settlementArrears('3000', '2026-04-16', '2026-05').total.toFixed(2)).toBe('1500.00');
    expect(vrsSplit('800000', '500000', '0')).toMatchObject({ exempt: expect.anything() });
    expect(vrsSplit('800000', '500000', '0').exempt.toFixed(2)).toBe('500000.00');
    expect(vrsSplit('800000', '500000', '200000').taxable.toFixed(2)).toBe('500000.00');
  });
});

describe('earned wage access (YX-PAY-40)', () => {
  it('Rohan: ₹30,000 net, 12 of 30 days, 50 % → ₹6,000; earlier draws and dues come off first; the maximum holds', () => {
    const { ewaAvailable } = jest.requireActual('./special') as typeof import('./special');
    expect(ewaAvailable({ expectedNet: '30000', monthDays: 30, payableDays: '12', drawn: '0', deductionsDue: '0', percent: '50', max: '20000' }).available.toFixed(0)).toBe('6000');
    expect(ewaAvailable({ expectedNet: '30000', monthDays: 30, payableDays: '12', drawn: '5049', deductionsDue: '2000', percent: '50', max: '20000' }).available.toFixed(0)).toBe('2475');
    expect(ewaAvailable({ expectedNet: '300000', monthDays: 30, payableDays: '29', drawn: '0', deductionsDue: '0', percent: '50', max: '20000' }).available.toFixed(0)).toBe('20000');
  });
});

describe('equity (YX-PAY-46, YX-TAX-18)', () => {
  const { vestingSchedule, esopPerquisite } = jest.requireActual('./special') as typeof import('./special');
  it('four years, a one-year cliff, quarterly after: a quarter at the cliff, then equal parts', () => {
    const v = vestingSchedule('2026-01-31', 4800, 12, 48, 3);
    expect(v[0]).toEqual({ vestOn: '2027-01-31', units: 1200 });
    expect(v[1]).toEqual({ vestOn: '2027-04-30', units: 300 });
    expect(v).toHaveLength(13);
    expect(v.reduce((t, x) => t + x.units, 0)).toBe(4800);
    expect(v[v.length - 1].vestOn).toBe('2030-01-31');
  });
  it('odd units: whole units and the last date takes the rest', () => {
    const v = vestingSchedule('2026-04-01', 1000, 0, 12, 4);
    expect(v.map((x) => x.units)).toEqual([333, 333, 334]);
  });
  it('the perquisite is the gain over the price, never negative', () => {
    expect(esopPerquisite('250', '100', 400).toFixed(2)).toBe('60000.00');
    expect(esopPerquisite('80', '100', 400).toFixed(2)).toBe('0.00');
  });
});
