import { LOOK_ALIKE_BITS, exchangeDifference, hamming, rateOn, toPay, variancePct } from './fx';

describe('expenses E5: exchange rates (XP-5.01, 5.02)', () => {
  const rows = [
    { rateDate: '2026-11-06', rate: '22.10' },
    { rateDate: '2026-11-12', rate: '22.75' },
    { rateDate: '2026-11-13', rate: '22.80' },
  ];

  it('a holiday uses the last rate published before it, and says how old it is', () => {
    expect(rateOn(rows, '2026-11-12')).toEqual({ rate: '22.75000000', rateDate: '2026-11-12', ageDays: 0 });
    expect(rateOn(rows, '2026-11-09')).toEqual({ rate: '22.10000000', rateDate: '2026-11-06', ageDays: 3 });
    expect(rateOn(rows, '2026-11-01')).toBeNull();
  });

  it('converts and measures the gap to the reference', () => {
    expect(toPay('1200', '22.75')).toBe('27300.00');
    expect(variancePct('23.66', '22.75')).toBe('4.00');
    expect(variancePct('22.75', '22.75')).toBe('0.00');
  });

  it('a forex return at a better rate is an exchange gain', () => {
    expect(exchangeDifference('80', '83.00', '84.50')).toEqual({ atIssue: '6640.00', atReturn: '6760.00', difference: '120.00' });
  });
});

describe('expenses E5: look-alike receipt photos (F4, XP-5.05)', () => {
  it('near-duplicate photos match; different receipts do not', () => {
    expect(hamming('f0e1d2c3b4a59687', 'f0e1d2c3b4a59687')).toBe(0);
    expect(hamming('f0e1d2c3b4a59687', 'f0e1d2c3b4a59686')).toBe(1);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('f0e1d2c3b4a59687', 'f0e1d2c3b4a596f8')).toBeLessThanOrEqual(LOOK_ALIKE_BITS);
    expect(hamming('f0e1d2c3b4a59687', '0f1e2d3c4b5a6978')).toBeGreaterThan(LOOK_ALIKE_BITS);
  });
});
