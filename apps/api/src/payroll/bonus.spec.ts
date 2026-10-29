import { Prisma } from '@prisma/client';
import { ACT_RULES, accountingYear, allocableSurplus, carriesInto, employeeBonus, rateProblem, settleYear, supportedRate, yearMonths, yearOf, type BonusRules } from './bonus';

// PAY-24 Payment of Bonus Act maths: positive and negative cases, with the boundaries (the eligibility limit, 29 and 30
// days, the lowest and highest rate, the ceiling, set-on and set-off over four years).
const R = ACT_RULES;
const twelve = (wage: string) => yearMonths(accountingYear(2025, R)).map((month) => ({ month, wage }));
const s = (x: Prisma.Decimal) => x.toFixed(2);

describe('accounting year', () => {
  it('April to March by default, due 8 months after the year end', () => {
    expect(accountingYear(2025, R)).toEqual({ start: '2025-04-01', end: '2026-03-31', label: '2025-26', dueOn: '2026-11-30' });
  });
  it('a calendar year when the company starts it in January; due date follows the setting', () => {
    expect(accountingYear(2024, { yearStartMonth: 1, dueMonths: 6 })).toEqual({ start: '2024-01-01', end: '2024-12-31', label: '2024', dueOn: '2025-06-30' });
  });
  it('the year a day falls in, on both sides of the start month', () => {
    expect(yearOf('2026-03-31', R).start).toBe('2025-04-01');
    expect(yearOf('2026-04-01', R).start).toBe('2026-04-01');
  });
  it('lists 12 months across the new year', () => {
    const m = yearMonths(accountingYear(2025, R));
    expect(m).toHaveLength(12);
    expect([m[0], m[8], m[11]]).toEqual(['2025-04', '2025-12', '2026-03']);
  });
});

describe('one employee', () => {
  it('8.33% on the wage up to ₹7,000 a month (whole year)', () => {
    const b = employeeBonus({ months: twelve('18000'), days: 300, minimumWage: '0' }, R, '8.33');
    expect([b.eligible, s(b.bonusSalary), s(b.bonus), s(b.payable)]).toEqual([true, '84000.00', '6997.00', '6997.00']);
  });
  it('20% at the highest rate', () => {
    expect(s(employeeBonus({ months: twelve('18000'), days: 300, minimumWage: '0' }, R, '20').bonus)).toBe('16800.00');
  });
  it('the ceiling is the minimum wage when that is higher than ₹7,000', () => {
    const b = employeeBonus({ months: twelve('18000'), days: 300, minimumWage: '14520' }, R, '8.33');
    expect([s(b.ceiling), s(b.bonusSalary), s(b.bonus)]).toEqual(['14520.00', '174240.00', '14514.00']);
  });
  it('a wage below the ceiling is used as it is', () => {
    expect(s(employeeBonus({ months: twelve('6000'), days: 300, minimumWage: '0' }, R, '8.33').bonusSalary)).toBe('72000.00');
  });
  it('exactly the eligibility limit is eligible; ₹1 above is not', () => {
    expect(employeeBonus({ months: twelve('21000'), days: 300, minimumWage: '0' }, R, '8.33').eligible).toBe(true);
    const above = employeeBonus({ months: twelve('21000.01'), days: 300, minimumWage: '0' }, R, '8.33');
    expect([above.eligible, above.reason, s(above.payable)]).toEqual([false, 'Wage above ₹21,000 a month all year.', '0.00']);
  });
  // Founder 30 Oct 2026 (item 24): the limit is tested on the full-month salary rate, not on what a part month earned.
  it('the limit is tested on the full-month rate: exactly ₹21,000 is eligible, ₹21,000.01 is not, whatever was earned', () => {
    const at = (rate: string, wage: string) => yearMonths(accountingYear(2025, R)).map((month) => ({ month, wage, rate }));
    const limit = employeeBonus({ months: at('21000', '21000'), days: 300, minimumWage: '0' }, R, '8.33');
    expect([limit.eligible, limit.eligibleMonths]).toEqual([true, 12]);
    // A part month (unpaid days) earned ₹10,000 on a ₹21,000.01 rate: still above the limit.
    const part = employeeBonus({ months: at('21000.01', '10000'), days: 300, minimumWage: '0' }, R, '8.33');
    expect([part.eligible, part.reason, s(part.payable)]).toEqual([false, 'Wage above ₹21,000 a month all year.', '0.00']);
  });
  it('earned more than the limit in a month (arrears of bonus wage) on a rate at the limit: still eligible', () => {
    const months = yearMonths(accountingYear(2025, R)).map((month, i) => ({ month, wage: i === 0 ? '25000' : '21000', rate: '21000' }));
    const b = employeeBonus({ months, days: 300, minimumWage: '0' }, R, '8.33');
    // Each month counts up to the ₹7,000 ceiling.
    expect([b.eligible, b.eligibleMonths, s(b.bonusSalary)]).toEqual([true, 12, '84000.00']);
  });
  it('a raise above the limit mid-year: the months on the higher rate earn nothing', () => {
    const months = yearMonths(accountingYear(2025, R)).map((month, i) => ({ month, wage: i < 9 ? '20000' : '21500', rate: i < 9 ? '20000' : '21500' }));
    expect(employeeBonus({ months, days: 300, minimumWage: '0' }, R, '8.33').eligibleMonths).toBe(9);
  });
  it('a month with no rate (imported history) is tested on what it earned', () => {
    const months = yearMonths(accountingYear(2025, R)).map((month, i) => ({ month, wage: '21000.01', rate: i < 6 ? '21000' : null }));
    expect(employeeBonus({ months, days: 300, minimumWage: '0' }, R, '8.33').eligibleMonths).toBe(6);
  });
  it('the limit follows the company setting (a more generous one)', () => {
    const at = (rate: string) => yearMonths(accountingYear(2025, R)).map((month) => ({ month, wage: '15000', rate }));
    const rules: BonusRules = { ...R, eligibilityWage: '25000' };
    expect(employeeBonus({ months: at('25000'), days: 300, minimumWage: '0' }, rules, '8.33').eligible).toBe(true);
    expect(employeeBonus({ months: at('25000.01'), days: 300, minimumWage: '0' }, rules, '8.33').eligible).toBe(false);
  });
  it('months above the limit earn nothing; the other months still do', () => {
    const months = twelve('20000').map((m, i) => (i >= 6 ? { ...m, wage: '22000' } : m));
    const b = employeeBonus({ months, days: 300, minimumWage: '0' }, R, '8.33');
    expect([b.eligible, b.eligibleMonths, s(b.bonusSalary)]).toEqual([true, 6, '42000.00']);
  });
  it('30 working days are enough; 29 are not', () => {
    expect(employeeBonus({ months: twelve('15000'), days: 30, minimumWage: '0' }, R, '8.33').eligible).toBe(true);
    const short = employeeBonus({ months: twelve('15000'), days: '29.5', minimumWage: '0' }, R, '8.33');
    expect([short.eligible, short.reason]).toEqual([false, 'Worked 29.5 days; at least 30 are needed.']);
  });
  it('the working-days limit is the company setting', () => {
    const rules: BonusRules = { ...R, minWorkingDays: 15 };
    expect(employeeBonus({ months: twelve('15000'), days: 20, minimumWage: '0' }, rules, '8.33').eligible).toBe(true);
  });
  it('no wage in the year: no bonus, with the reason', () => {
    const b = employeeBonus({ months: twelve('0'), days: 300, minimumWage: '0' }, R, '8.33');
    expect([b.eligible, b.reason]).toEqual([false, 'No bonus wage paid in the year.']);
  });
  it('the minimum bonus of ₹100 a year, cut down for part of the year', () => {
    const low = twelve('0').map((m, i) => (i < 3 ? { ...m, wage: '200' } : m));
    const b = employeeBonus({ months: low, days: 60, minimumWage: '0' }, R, '8.33');
    // 600 × 8.33% = 49.98 → 50; floor 100 × 3/12 = 25: the percentage is higher.
    expect(s(b.bonus)).toBe('50.00');
    const tiny = twelve('0').map((m, i) => (i < 6 ? { ...m, wage: '100' } : m));
    // 600 × 8.33% = 50; floor 100 × 6/12 = 50; equal.
    expect(s(employeeBonus({ months: tiny, days: 60, minimumWage: '0' }, R, '8.33').bonus)).toBe('50.00');
    expect(s(employeeBonus({ months: twelve('50'), days: 300, minimumWage: '0' }, R, '8.33').bonus)).toBe('100.00');
  });
  it('puja bonus and misconduct loss are deducted, never below zero', () => {
    const b = employeeBonus({ months: twelve('18000'), days: 300, minimumWage: '0', pujaPaid: '2000', misconductLoss: '500.50' }, R, '8.33');
    expect([s(b.deductions), s(b.payable)]).toEqual(['2500.50', '4496.50']);
    const all = employeeBonus({ months: twelve('18000'), days: 300, minimumWage: '0', pujaPaid: '9000' }, R, '8.33');
    expect([s(all.deductions), s(all.payable)]).toEqual(['6997.00', '0.00']);
  });
  it('dismissed for misconduct (s.9): no bonus', () => {
    const b = employeeBonus({ months: twelve('18000'), days: 300, minimumWage: '0', disqualified: true }, R, '20');
    expect([b.eligible, s(b.payable)]).toEqual([false, '0.00']);
  });
  it('a higher company limit and ceiling are used when set', () => {
    const rules: BonusRules = { ...R, eligibilityWage: '25000', calculationCeiling: '10000' };
    const b = employeeBonus({ months: twelve('24000'), days: 300, minimumWage: '0' }, rules, '8.33');
    expect([b.eligible, s(b.bonusSalary)]).toEqual([true, '120000.00']);
  });
});

describe('the rate', () => {
  it('8.33% and 20% are allowed; just outside is refused', () => {
    expect(rateProblem('8.33', R)).toBeNull();
    expect(rateProblem('20', R)).toBeNull();
    expect(rateProblem('8.32', R)).toBe('The bonus rate must be between 8.33% and 20%.');
    expect(rateProblem('20.01', R)).toBe('The bonus rate must be between 8.33% and 20%.');
  });
  it('never below what the surplus supports', () => {
    expect(rateProblem('11', R, '12.5')).toBe('The surplus supports 12.5%, so the bonus rate must be between 12.5% and 20%.');
    expect(rateProblem('12.5', R, '12.5')).toBeNull();
  });
  it('refuses settings where the lowest rate is above the highest', () => {
    expect(rateProblem('10', { minRate: '15', maxRate: '10' })).toMatch(/Ask HR to fix the bonus settings/);
  });
  it('the allocable surplus is 60% (or the setting) of the available surplus', () => {
    expect(s(allocableSurplus('4820000', R))).toBe('2892000.00');
    expect(s(allocableSurplus('100', { allocablePercent: '67' }))).toBe('67.00');
  });
  it('the surplus decides the rate, between the lowest and the highest', () => {
    const base = { setOn: [], setOff: [], salaryTotal: '1000000' };
    expect(s(supportedRate({ ...base, allocable: null }, R))).toBe('8.33');
    expect(s(supportedRate({ ...base, allocable: '50000' }, R))).toBe('8.33');
    expect(s(supportedRate({ ...base, allocable: '124567' }, R))).toBe('12.45');
    expect(s(supportedRate({ ...base, allocable: '900000' }, R))).toBe('20.00');
    expect(s(supportedRate({ ...base, allocable: '100000', salaryTotal: '0' }, R))).toBe('8.33');
  });
  it('set-off brought in lowers the rate; set-on raises it', () => {
    const base = { allocable: '150000', salaryTotal: '1000000' };
    expect(s(supportedRate({ ...base, setOn: [], setOff: [{ year: '2024-04-01', amount: '50000' }] }, R))).toBe('10.00');
    expect(s(supportedRate({ ...base, setOn: [{ year: '2024-04-01', amount: '30000' }], setOff: [] }, R))).toBe('18.00');
  });
});

describe('set-on and set-off', () => {
  const y = (n: number) => `${n}-04-01`;
  it('surplus above the highest bonus becomes set-on, up to 20% of the bonus wage', () => {
    const r = settleYear({ allocable: '300000', setOn: [], setOff: [], totalBonus: '200000', minTotal: '83300', salaryTotal: '1000000' }, R);
    expect([s(r.setOnCreated), s(r.setOffCreated)]).toEqual(['100000.00', '0.00']);
    const capped = settleYear({ allocable: '900000', setOn: [], setOff: [], totalBonus: '200000', minTotal: '83300', salaryTotal: '1000000' }, R);
    expect(s(capped.setOnCreated)).toBe('200000.00');
  });
  it('a shortfall to pay the minimum becomes set-off', () => {
    const r = settleYear({ allocable: '50000', setOn: [], setOff: [], totalBonus: '83300', minTotal: '83300', salaryTotal: '1000000' }, R);
    expect([s(r.setOnCreated), s(r.setOffCreated)]).toEqual(['0.00', '33300.00']);
  });
  it('no surplus at all: the whole minimum is set-off', () => {
    expect(s(settleYear({ allocable: '0', setOn: [], setOff: [], totalBonus: '83300', minTotal: '83300', salaryTotal: '1000000' }, R).setOffCreated)).toBe('83300.00');
  });
  it('set-on brought in pays the shortfall first, oldest first', () => {
    const r = settleYear({ allocable: '50000', setOn: [{ year: y(2023), amount: '20000' }, { year: y(2021), amount: '10000' }], setOff: [], totalBonus: '83300', minTotal: '83300', salaryTotal: '1000000' }, R);
    expect(r.setOnUsed).toEqual([{ year: y(2021), amount: '10000.00' }, { year: y(2023), amount: '20000.00' }]);
    expect(s(r.setOffCreated)).toBe('3300.00');
  });
  it('set-off brought in is settled from the surplus first, oldest first', () => {
    const r = settleYear({ allocable: '120000', setOn: [], setOff: [{ year: y(2024), amount: '30000' }, { year: y(2022), amount: '20000' }], totalBonus: '83300', minTotal: '83300', salaryTotal: '1000000' }, R);
    expect(r.setOffSettled).toEqual([{ year: y(2022), amount: '20000.00' }, { year: y(2024), amount: '30000.00' }]);
    expect([s(r.setOnCreated), s(r.setOffCreated)]).toEqual(['0.00', '13300.00']);
  });
  it('paying more than the surplus supports makes no set-off', () => {
    const r = settleYear({ allocable: '100000', setOn: [], setOff: [], totalBonus: '200000', minTotal: '83300', salaryTotal: '1000000' }, R);
    expect(s(r.setOffCreated)).toBe('0.00');
  });
  it('no surplus entered: nothing settled or made', () => {
    expect(settleYear({ allocable: null, setOn: [], setOff: [], totalBonus: '1', minTotal: '1', salaryTotal: '1' }, R)).toEqual({ setOffSettled: [], setOnUsed: [], setOnCreated: new Prisma.Decimal(0), setOffCreated: new Prisma.Decimal(0) });
  });
  it('carries last four years, less what later years used; the fifth year back has lapsed', () => {
    const earlier = [
      { year: y(2020), setOnMade: [{ year: y(2020), amount: '5000' }], setOffMade: [], setOnUsed: [], setOffSettled: [] },
      { year: y(2021), setOnMade: [{ year: y(2021), amount: '40000' }], setOffMade: [], setOnUsed: [], setOffSettled: [] },
      { year: y(2023), setOnMade: [], setOffMade: [{ year: y(2023), amount: '9000' }], setOnUsed: [{ year: y(2021), amount: '15000' }], setOffSettled: [] },
      { year: y(2024), setOnMade: [], setOffMade: [], setOnUsed: [], setOffSettled: [{ year: y(2023), amount: '9000' }] },
    ];
    expect(carriesInto(y(2025), earlier, R)).toEqual({ setOn: [{ year: y(2021), amount: '25000.00' }], setOff: [] });
    // In 2026 the 2021 set-on has lapsed too.
    expect(carriesInto(y(2026), earlier, R).setOn).toEqual([]);
  });
  it('an opening amount from before YukthiX counts as made the year before', () => {
    const earlier = [{ year: y(2024), setOnMade: [{ year: y(2023), amount: '7000' }], setOffMade: [], setOnUsed: [{ year: y(2023), amount: '2000' }], setOffSettled: [] }];
    expect(carriesInto(y(2025), earlier, R).setOn).toEqual([{ year: y(2023), amount: '5000.00' }]);
  });
});
