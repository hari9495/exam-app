import { BadRequestException } from '@nestjs/common';
import { accrualsDue } from './time-maths';
import { parseRules } from './time-core';
import {
  creditsDuringAbsence,
  encashTerms,
  leaveYearWith,
  monthLimitOver,
  monthName,
  monthsIn,
  noticePeriodMode,
  shortYearEnd,
  statutoryProblem,
  yearChangeProblem,
  yearEndWithEncash,
} from './leave-rules';

// TIM-27 leave type rules and TIM-29 leave-year change (Nov 2026): positive and negative, with the boundaries.

describe('TIM-27 most days in a month', () => {
  const days = (ons: string[], portion = 1) => ons.map((on) => ({ on, portion }));
  it('no limit: never over', () => {
    expect(monthLimitOver(null, days(['2026-11-02', '2026-11-03']), new Map([['2026-11', 30]]))).toBeNull();
  });
  it('exactly at the limit is allowed', () => {
    expect(monthLimitOver(3, days(['2026-11-02']), new Map([['2026-11', 2]]))).toBeNull();
  });
  it('one day over the limit is refused, naming the month and what is already taken', () => {
    expect(monthLimitOver(3, days(['2026-11-02', '2026-11-03']), new Map([['2026-11', 2]]))).toEqual({ month: '2026-11', already: 2, asked: 2 });
  });
  it('half days count as half (2.5 + 0.5 = 3 fits, + 1 more half does not)', () => {
    expect(monthLimitOver(3, days(['2026-11-02'], 0.5), new Map([['2026-11', 2.5]]))).toBeNull();
    expect(monthLimitOver(3, [...days(['2026-11-02'], 0.5), ...days(['2026-11-03'], 0.5)], new Map([['2026-11', 2.5]]))).toEqual({ month: '2026-11', already: 2.5, asked: 1 });
  });
  it('a request across two months is checked month by month', () => {
    const req = days(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(monthLimitOver(2, req, new Map())).toBeNull();
    expect(monthLimitOver(2, req, new Map([['2026-12', 1]]))).toEqual({ month: '2026-12', already: 1, asked: 2 });
  });
  it('weekly offs and holidays (portion 0) never count', () => {
    expect(monthLimitOver(1, [{ on: '2026-11-07', portion: 0 }, { on: '2026-11-09', portion: 1 }], new Map())).toBeNull();
  });
  it('names the month in plain words', () => {
    expect(monthName('2026-11')).toBe('November 2026');
  });
  it('parseRules: 0.5 to 31 in half days; a single request may not be bigger than the month', () => {
    expect(parseRules({ maxDaysPerMonth: 10, maxDays: 10 }).maxDaysPerMonth).toBe(10);
    expect(() => parseRules({ maxDaysPerMonth: 0 })).toThrow(BadRequestException);
    expect(() => parseRules({ maxDaysPerMonth: 31.5 })).toThrow('0.5 to 31');
    expect(() => parseRules({ maxDaysPerMonth: 2.25 })).toThrow(BadRequestException);
    expect(() => parseRules({ maxDaysPerMonth: 5, maxDays: 6 })).toThrow('monthly limit of 5');
  });
});

describe('TIM-27 cash-in limits and payout', () => {
  const company = { maxPerYear: 7, minLeft: 7, divisor: 26 };
  it('the company values are the default', () => {
    expect(encashTerms({}, company)).toEqual(company);
    expect(encashTerms({ encashMaxDays: null, encashMinLeft: null, encashDivisor: null }, company)).toEqual(company);
  });
  it('the type overrides each value on its own, 0 included', () => {
    expect(encashTerms({ encashMaxDays: 15, encashMinLeft: 0, encashDivisor: 30 }, company)).toEqual({ maxPerYear: 15, minLeft: 0, divisor: 30 });
  });
  it('parseRules checks the values', () => {
    expect(parseRules({ encashable: true, encashMaxDays: 10.5, encashDivisor: 30 }).encashDivisor).toBe(30);
    expect(() => parseRules({ encashDivisor: 31 })).toThrow('26 or 30');
    expect(() => parseRules({ encashMaxDays: -1 })).toThrow(BadRequestException);
    expect(() => parseRules({ encashAtExit: 'yes' })).toThrow('yes or no');
    expect(parseRules({}).encashAtExit).toBe(true);
  });
});

describe('TIM-29 year end with cash-in', () => {
  it('under the cap: all carried, nothing paid or lapsed', () => {
    expect(yearEndWithEncash(30, 30, 7)).toEqual({ carry: 30, encash: 0, lapse: 0 });
  });
  it('over the cap: pays up to what the yearly limit still allows, the rest lapses', () => {
    expect(yearEndWithEncash(45, 30, 7)).toEqual({ carry: 30, encash: 7, lapse: 8 });
  });
  it('limit already used: everything over the cap lapses', () => {
    expect(yearEndWithEncash(45, 30, 0)).toEqual({ carry: 30, encash: 0, lapse: 15 });
    expect(yearEndWithEncash(45, 30, -2)).toEqual({ carry: 30, encash: 0, lapse: 15 });
  });
  it('half days: pays whole and half days only, never more than is over', () => {
    expect(yearEndWithEncash(31.5, 30, 7)).toEqual({ carry: 30, encash: 1.5, lapse: 0 });
    expect(yearEndWithEncash(40, 30, 2.75)).toEqual({ carry: 30, encash: 2.5, lapse: 7.5 });
  });
  it('no cap (carries in full) or a negative balance: nothing to pay', () => {
    expect(yearEndWithEncash(80, null, 7)).toEqual({ carry: 80, encash: 0, lapse: 0 });
    expect(yearEndWithEncash(-2, 30, 7)).toEqual({ carry: -2, encash: 0, lapse: 0 });
  });
});

describe('TIM-27 statutory lock', () => {
  const law = { law: 'Maternity Benefit Act 1961', days: 182, paidInFull: true };
  const ok = { name: 'Maternity leave', paid: true, active: true, rules: { maxDays: null, maxDaysPerMonth: null, paySteps: null, noticeDays: null, noticeMode: 'block' } };
  it('no law for the kind: anything goes', () => {
    expect(statutoryProblem(null, { ...ok, paid: false })).toBeNull();
  });
  it('the law values themselves pass, and more than the law is fine', () => {
    expect(statutoryProblem(law, ok)).toBeNull();
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, maxDays: 182 } })).toBeNull();
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, maxDays: 200 } })).toBeNull();
  });
  it('below the legal length by one day is refused with the law named', () => {
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, maxDays: 181 } })).toBe('Maternity leave can be up to 26 weeks by law (Maternity Benefit Act 1961). The most days in one request can\'t be below 182.');
  });
  it('unpaid or reduced pay is refused', () => {
    expect(statutoryProblem(law, { ...ok, paid: false })).toContain("can't be unpaid");
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, paySteps: [{ days: 84, percent: 100 }, { days: 98, percent: 50 }] } })).toContain('paid in full');
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, paySteps: [{ days: 182, percent: 100 }] } })).toBeNull();
  });
  it('a monthly limit, refusing short notice or switching it off are refused', () => {
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, maxDaysPerMonth: 31 } })).toContain('no monthly limit');
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, noticeDays: 30, noticeMode: 'block' } })).toContain('short notice');
    expect(statutoryProblem(law, { ...ok, rules: { ...ok.rules, noticeDays: 30, noticeMode: 'warn' } })).toBeNull();
    expect(statutoryProblem(law, { ...ok, active: false })).toContain('stays in use');
  });
});

describe('TIM-27 absence and notice choices', () => {
  it('notice period: the type wins, else the company', () => {
    expect(noticePeriodMode(null, 'sick_and_unpaid_only')).toBe('sick_and_unpaid_only');
    expect(noticePeriodMode('allowed', 'sick_and_unpaid_only')).toBe('no_change');
    expect(noticePeriodMode('extends', 'no_change')).toBe('extends_last_day');
    expect(noticePeriodMode('blocked', 'no_change')).toBe('blocked');
  });
  it('long absence: the type wins, else the absence (company setting when recorded)', () => {
    expect(creditsDuringAbsence(null, false)).toBe(false);
    expect(creditsDuringAbsence(undefined, true)).toBe(true);
    expect(creditsDuringAbsence('continue', false)).toBe(true);
    expect(creditsDuringAbsence('pause', true)).toBe(false);
  });
  it('parseRules refuses unknown choices', () => {
    expect(() => parseRules({ longAbsence: 'sometimes' })).toThrow(BadRequestException);
    expect(() => parseRules({ noticePeriod: 'unpaid' })).toThrow(BadRequestException);
  });
});

describe('TIM-29 leave-year change (calendar year to financial year)', () => {
  const change = { fromOn: '2027-01-01', oldStartMonth: 1, newStartMonth: 4 };
  it('the short year runs 1 Jan to 31 Mar', () => {
    expect(shortYearEnd('2027-01-01', 4)).toBe('2027-03-31');
    expect(monthsIn('2027-01-01', '2027-03-31')).toBe(3);
  });
  it('before the change: the old calendar year (the last day included)', () => {
    expect(leaveYearWith('2026-12-31', 1, change)).toEqual({ start: '2026-01-01', end: '2026-12-31', short: false });
  });
  it('first and last day of the short year', () => {
    expect(leaveYearWith('2027-01-01', 1, change)).toEqual({ start: '2027-01-01', end: '2027-03-31', short: true });
    expect(leaveYearWith('2027-03-31', 1, change)).toEqual({ start: '2027-01-01', end: '2027-03-31', short: true });
  });
  it('after it: financial years', () => {
    expect(leaveYearWith('2027-04-01', 1, change)).toEqual({ start: '2027-04-01', end: '2028-03-31', short: false });
    expect(leaveYearWith('2028-02-29', 1, change)).toEqual({ start: '2027-04-01', end: '2028-03-31', short: false });
  });
  it('no change: the plain year from the setting', () => {
    expect(leaveYearWith('2026-03-31', 4, null)).toEqual({ start: '2025-04-01', end: '2026-03-31', short: false });
  });
  it('a short year credits only its months: yearly 24 days → 6, monthly 2 a month for 3 months', () => {
    const yearly = accrualsDue({ annualDays: 24, frequency: 'yearly', proRata: true, rounding: 0.5 }, { yearStart: '2027-01-01', yearEnd: '2027-03-31', joinedOn: '2020-01-01', upTo: '2027-03-31' });
    expect(yearly).toEqual([{ periodKey: 'accrual:2027-01-01', on: '2027-01-01', days: 6 }]);
    const monthly = accrualsDue({ annualDays: 24, frequency: 'monthly', proRata: true, rounding: 0.5 }, { yearStart: '2027-01-01', yearEnd: '2027-03-31', joinedOn: '2020-01-01', upTo: '2027-12-31' });
    expect(monthly.map((d) => d.days)).toEqual([2, 2, 2]);
    expect(monthly.map((d) => d.periodKey)).toEqual(['accrual:2027-01', 'accrual:2027-02', 'accrual:2027-03']);
  });
  it('a joiner in the short year gets the share from joining', () => {
    const yearly = accrualsDue({ annualDays: 24, frequency: 'yearly', proRata: true, rounding: 0.5 }, { yearStart: '2027-01-01', yearEnd: '2027-03-31', joinedOn: '2027-02-15', upTo: '2027-03-31' });
    expect(yearly[0].days).toBe(3);
  });
  it('the change must start on the first day of a future old leave year, to another month', () => {
    expect(yearChangeProblem('2027-01-01', 1, 4, '2026-11-02')).toBeNull();
    expect(yearChangeProblem('2027-01-01', 1, 1, '2026-11-02')).toContain('already starts');
    expect(yearChangeProblem('2027-02-01', 1, 4, '2026-11-02')).toContain('first day of a leave year (1 January)');
    expect(yearChangeProblem('2027-01-01', 1, 4, '2027-01-01')).toContain('not started yet');
  });
});
