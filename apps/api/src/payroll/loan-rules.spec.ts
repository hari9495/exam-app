import { Prisma } from '@prisma/client';
import { dayMonYear, loanRoom, maxMonthsOf } from './loan-rules';

const D = (x: string) => new Prisma.Decimal(x);

describe('loan rules (founder decision 8)', () => {
  it('limit is months × gross; exactly the limit fits, a paisa more does not', () => {
    const r = loanRoom(D('30000'), 2, D('0'));
    expect(r.limit!.toFixed(2)).toBe('60000.00');
    expect(D('60000.00').lte(r.available!)).toBe(true);
    expect(D('60000.01').lte(r.available!)).toBe(false);
  });

  it('counts what is still owed on open loans, never below zero', () => {
    expect(loanRoom(D('30000'), 2, D('12000')).available!.toFixed(2)).toBe('48000.00');
    expect(loanRoom(D('30000'), 2, D('75000')).available!.toFixed(2)).toBe('0.00');
  });

  it("'none' is no limit", () => {
    expect(maxMonthsOf('none')).toBeNull();
    expect(maxMonthsOf('12')).toBe(12);
    expect(loanRoom(D('30000'), null, D('5000'))).toEqual({ limit: null, available: null });
  });

  it('no pay in force gives a zero limit', () => {
    const r = loanRoom(D('0'), 2, D('0'));
    expect(r.limit!.toFixed(2)).toBe('0.00');
    expect(r.available!.toFixed(2)).toBe('0.00');
  });

  it('keeps paise exactly', () => {
    expect(loanRoom(D('33333.33'), 3, D('0.01')).available!.toFixed(2)).toBe('99999.98');
  });

  it('dates read "14 Dec 2026"', () => {
    expect(dayMonYear('2026-12-14')).toBe('14 Dec 2026');
    expect(dayMonYear('2027-09-01')).toBe('1 Sep 2027');
  });
});
