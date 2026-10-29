import { Prisma } from '@prisma/client';
import { closingInterest, dayMonYear, interestFrom, loanRoom, loanSchedule, maxMonthsOf, rateKeyOf } from './loan-rules';

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

describe('loan schedule and pre-closure (founder answers 1 and 5)', () => {
  const base = { principal: D('12000'), ratePct: D('0'), emi: D('2000'), outstanding: D('12000'), firstMonth: '2026-11', pausedUntil: null, open: true, repayments: [] };

  it('interest-free: equal instalments, the last one only what is left', () => {
    const r = loanSchedule({ ...base, emi: D('5000') });
    expect(r.map((x) => [x.month, x.emi, x.balance, x.status])).toEqual([
      ['2026-11', '5000.00', '7000.00', 'scheduled'],
      ['2026-12', '5000.00', '2000.00', 'scheduled'],
      ['2027-01', '2000.00', '0.00', 'scheduled'],
    ]);
  });

  it('recovered months first, then the rest from the balance; a pause through a month skips it (year boundary)', () => {
    const r = loanSchedule({ ...base, outstanding: D('10000'), pausedUntil: '2026-12', repayments: [{ month: '2026-11', amount: D('2000') }] });
    expect(r[0]).toMatchObject({ no: 1, month: '2026-11', emi: '2000.00', balance: '10000.00', status: 'recovered' });
    expect(r[1]).toMatchObject({ month: '2026-12', emi: '0.00', status: 'paused' });
    expect(r[2]).toMatchObject({ month: '2027-01', status: 'scheduled', balance: '8000.00' });
    expect(r[r.length - 1]).toMatchObject({ month: '2027-05', balance: '0.00' });
  });

  it('with interest: the month interest on the balance first, as the run books it', () => {
    const r = loanSchedule({ ...base, principal: D('100000'), outstanding: D('100000'), ratePct: D('12'), emi: D('8885') });
    expect(r[0]).toMatchObject({ interest: '1000.00', principal: '7885.00', balance: '92115.00' });
    expect(r).toHaveLength(12);
    expect(r[11].balance).toBe('0.00');
  });

  it('a closed loan has no months to come; zero instalment never loops', () => {
    expect(loanSchedule({ ...base, open: false, repayments: [{ month: '2026-11', amount: D('2000') }] })).toHaveLength(1);
    expect(loanSchedule({ ...base, emi: D('0') })).toHaveLength(0);
  });

  it('pre-closure interest: days inclusive on a 365-day year; zero when interest-free or not yet running', () => {
    expect(closingInterest(D('36500'), D('10'), '2026-11-01', '2026-11-10')).toEqual({ days: 10, interest: D('100.00') });
    expect(closingInterest(D('36500'), D('0'), '2026-11-01', '2026-11-10').interest.toFixed(2)).toBe('0.00');
    expect(closingInterest(D('36500'), D('10'), '2026-12-01', '2026-11-10')).toEqual({ days: 0, interest: D('0.00') });
    expect(closingInterest(D('36500'), D('10'), '2028-02-01', '2028-02-29').days).toBe(29);
    expect(interestFrom('2026-09', '2026-10')).toBe('2026-11-01');
    expect(interestFrom('2026-12', null)).toBe('2026-12-01');
  });

  it('the interest setting is per loan type; an expense recovery has none', () => {
    expect(rateKeyOf('loan')).toBe('payroll.loan.interest_rate.loan');
    expect(rateKeyOf('advance')).toBe('payroll.loan.interest_rate.advance');
    expect(rateKeyOf('expense')).toBeNull();
  });
});
