import { dayBefore, financialYear, marginPct, rateChangeProblem, toPaise, toRupees } from './staffing-rules';

describe('staffing rules', () => {
  it('rupees to paise exactly; bad amounts are null', () => {
    expect(toPaise('1200')).toBe(120000n);
    expect(toPaise('1200.5')).toBe(120050n);
    expect(toPaise('0.07')).toBe(7n);
    expect(toPaise(' 999999999.99 ')).toBe(99999999999n);
    for (const bad of ['', '-1', '1e3', '12.345', '1,200', 'abc', '1234567890']) expect(toPaise(bad)).toBeNull();
    expect(toRupees(120050n)).toBe('1200.50');
    expect(toRupees(7n)).toBe('0.07');
  });

  it('margin in per cent of the bill rate, rounded half up to one decimal', () => {
    expect(marginPct(120000n, 80000n)).toBe('33.3');
    expect(marginPct(165000n, 110000n)).toBe('33.3');
    expect(marginPct(90000n, 58000n)).toBe('35.6');
    expect(marginPct(100000n, 100000n)).toBe('0.0');
    expect(marginPct(80000n, 79960n)).toBe('0.1'); // 0.05 rounds up
  });

  it('a dated change starts after the current one and no earlier than the company allows', () => {
    expect(rateChangeProblem('2026-04-01', '2026-11-14', '2026-11-14', 0)).toBeNull();
    expect(rateChangeProblem('2026-04-01', '2026-04-01', '2026-03-01', 0)).toMatch(/after 2026-04-01/);
    expect(rateChangeProblem('2026-04-01', '2026-11-13', '2026-11-14', 0)).toBe('A new rate starts today or later.');
    expect(rateChangeProblem('2026-04-01', '2026-10-15', '2026-11-14', 30)).toBeNull();
    expect(rateChangeProblem('2026-04-01', '2026-10-14', '2026-11-14', 30)).toMatch(/at most 30 days back/);
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29'); // leap year
  });

  it('Indian financial year: April to March', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2099-12-31')).toBe('2099-00');
  });
});
