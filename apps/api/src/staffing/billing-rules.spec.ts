import { ageingBucket, conversionFee, creditProblem, eInvoiceState, gstSplit, guaranteeOutcome, lineAmount, mondayOf, nextReminder, pctToBp, placementFee, splitTds, taperProblem } from './billing-rules';

describe('staffing billing rules', () => {
  it('percent strings to basis points; bad ones refused', () => {
    expect([pctToBp('18'), pctToBp('8.33'), pctToBp('0.5'), pctToBp('100')]).toEqual([1800, 833, 50, 10000]);
    for (const bad of ['100.01', '8.333', '-1', 'x', '']) expect(pctToBp(bad)).toBeNull();
  });
  it('a line is hours × rate rounded half up to the paisa', () => {
    expect(lineAmount(16000, 120000n)).toBe(19200000n); // 160 h × ₹1,200
    expect(lineAmount(150, 33333n)).toBe(50000n); // 1.5 × 333.33 = 499.995 → 500.00
    expect(lineAmount(1, 1n)).toBe(0n);
  });
  it('GST: intra-state CGST + SGST half each (odd paisa to SGST); inter-state IGST', () => {
    expect(gstSplit(10000n, 1800, false)).toEqual({ cgst: 900n, sgst: 900n, igst: 0n, total: 11800n });
    expect(gstSplit(10003n, 1800, false)).toEqual({ cgst: 900n, sgst: 901n, igst: 0n, total: 11804n });
    expect(gstSplit(10000n, 1800, true)).toEqual({ cgst: 0n, sgst: 0n, igst: 1800n, total: 11800n });
  });
  it('a credit note never exceeds what is left on the invoice', () => {
    expect(creditProblem(1000n, 0n, 1000n)).toBeNull();
    expect(creditProblem(1000n, 400n, 601n)).toMatch(/more than what is left/);
    expect(creditProblem(1000n, 0n, 0n)).toMatch(/Enter the amount/);
  });
  it('TDS splits in proportion and always sums exactly', () => {
    expect(splitTds(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(splitTds(16000n, [800000n, 16000n])).toEqual([15686n, 314n]);
    expect(splitTds(0n, [5n])).toEqual([0n]);
  });
  it('the e-invoice window: ok, warning from day 25, blocked after day 30, not applicable', () => {
    const rule = { reportWithinDays: 30, warnFromDay: 25 };
    expect(eInvoiceState('2026-10-01', '2026-10-11', true, rule)).toEqual({ days: 10, state: 'ok' });
    expect(eInvoiceState('2026-10-01', '2026-10-26', true, rule).state).toBe('warning');
    expect(eInvoiceState('2026-10-01', '2026-10-31', true, rule).state).toBe('warning'); // day 30 still in
    expect(eInvoiceState('2026-10-01', '2026-11-01', true, rule).state).toBe('blocked');
    expect(eInvoiceState('2026-10-01', '2026-12-01', false, rule).state).toBe('not_applicable');
  });
  it('ageing and the next reminder on the schedule', () => {
    expect([ageingBucket('2026-10-01', '2026-10-31'), ageingBucket('2026-10-01', '2026-11-01'), ageingBucket('2026-08-01', '2026-11-05')]).toEqual(['0–30', '31–60', '90+']);
    expect(nextReminder('2026-11-10', '2026-11-01', 'standard')).toBe('2026-11-07');
    expect(nextReminder('2026-11-10', '2026-11-20', 'standard')).toBe('2026-12-01');
    expect(nextReminder('2026-11-10', '2027-01-01', 'standard')).toBeNull();
    expect(nextReminder('2026-11-10', '2026-11-01', 'off')).toBeNull();
  });
  it('fees: percent of CTC or fixed; the taper tier; the guarantee credit', () => {
    expect(placementFee({ feeKind: 'percent', feePctBp: 833, feePaise: null }, 180000000n)).toBe(14994000n);
    expect(placementFee({ feeKind: 'fixed', feePctBp: null, feePaise: 15000000n }, 1n)).toBe(15000000n);
    const taper = [{ fromMonth: 0, pctBp: 833 }, { fromMonth: 3, pctBp: 600 }, { fromMonth: 12, pctBp: 0 }];
    expect([conversionFee(taper, 2, 10000n), conversionFee(taper, 7, 10000n), conversionFee(taper, 12, 10000n)]).toEqual([833n, 600n, 0n]);
    expect(taperProblem(taper)).toBeNull();
    expect(taperProblem([{ fromMonth: 1, pctBp: 5 }])).toMatch(/month 0/);
    expect(taperProblem([{ fromMonth: 0, pctBp: 5 }, { fromMonth: 3, pctBp: 6 }])).toMatch(/only goes down/);
    expect(guaranteeOutcome(9000n, 90, 30, 'refund')).toEqual({ covered: true, credit: 6000n });
    expect(guaranteeOutcome(9000n, 90, 30, 'replace')).toEqual({ covered: true, credit: 0n });
    expect(guaranteeOutcome(9000n, 60, 75, 'refund')).toEqual({ covered: false, credit: 0n });
  });
  it('the Monday of a week', () => {
    expect([mondayOf('2026-11-09'), mondayOf('2026-11-15'), mondayOf('2026-11-12')]).toEqual(['2026-11-09', '2026-11-09', '2026-11-09']);
  });
});

import { benchLop } from './billing-rules';

describe('bench pay as loss-of-pay days (answer 482)', () => {
  it('half pay: half of each bench day in the month is loss of pay', () => {
    expect(benchLop('2026-10-21', null, '2026-10', 50, 30, false)).toEqual({ benchDays: 11, lopDays: '5.50' });
    expect(benchLop('2026-09-15', '2026-10-04', '2026-10', 60, 30, false)).toEqual({ benchDays: 4, lopDays: '1.60' });
  });
  it('full pay makes none; outside the month makes nothing', () => {
    expect(benchLop('2026-10-01', null, '2026-10', 100, 30, false)).toEqual({ benchDays: 31, lopDays: '0.00' });
    expect(benchLop('2026-11-02', null, '2026-10', 50, 30, false)).toEqual({ benchDays: 0, lopDays: '0.00' });
    expect(benchLop('2026-08-01', '2026-09-30', '2026-10', 50, 30, false)).toEqual({ benchDays: 0, lopDays: '0.00' });
  });
  it('past the maximum days with "then unpaid", each day is wholly unpaid; with review, still at bench pay', () => {
    // Bench from 20 Sep: Oct 1 is day 12; days 12–30 (19 days) at half pay, days 31–42 (12 days) unpaid.
    expect(benchLop('2026-09-20', null, '2026-10', 50, 30, true)).toEqual({ benchDays: 31, lopDays: '21.50' });
    expect(benchLop('2026-09-20', null, '2026-10', 50, 30, false)).toEqual({ benchDays: 31, lopDays: '15.50' });
  });
});
