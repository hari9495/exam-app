import { NO_PAY_LAW, payProblem, pickPayLaw, type PayRuleRow } from './pay-law';

// HIR-24: the law row for a place and the refusals (positive and negative, boundaries).
describe('HIR-24 pay law', () => {
  const rows: PayRuleRow[] = [
    { jurisdiction: 'US-NY', values: { rangeRequired: true, historyBanned: true, name: 'New York pay transparency law' }, source: 's', verify: true },
    { jurisdiction: 'IN', values: { rangeRequired: false, historyBanned: false, name: 'India' }, source: 's', verify: true },
    { jurisdiction: 'EU', values: { rangeRequired: true, historyBanned: true, name: 'EU Pay Transparency Directive', countries: ['DE', 'FR'] }, source: 's', verify: true },
  ];

  it('picks the state row, then the country row, then a list that names the country', () => {
    expect(pickPayLaw(rows, { country: 'US', state: 'US-NY' })).toMatchObject({ rangeRequired: true, historyBanned: true, name: 'New York pay transparency law', verify: true });
    expect(pickPayLaw(rows, { country: 'IN', state: 'IN-TN' })).toMatchObject({ rangeRequired: false, historyBanned: false, name: 'India' });
    expect(pickPayLaw(rows, { country: 'de', state: 'DE-BE' })).toMatchObject({ rangeRequired: true, name: 'EU Pay Transparency Directive' });
  });

  it('no row (a US state without a law, no location) is the company choice', () => {
    expect(pickPayLaw(rows, { country: 'US', state: 'US-TX' })).toEqual(NO_PAY_LAW);
    expect(pickPayLaw(rows, null)).toEqual(NO_PAY_LAW);
    expect(pickPayLaw([], { country: 'IN', state: 'IN-KA' })).toEqual(NO_PAY_LAW);
  });

  const ny = pickPayLaw(rows, { country: 'US', state: 'US-NY' });
  const ok = { salaryMin: 100, salaryMax: 200, showSalary: true, askPayHistory: false, isPublic: true };

  it('a range with minimum equal to maximum is fine; minimum above maximum is refused anywhere', () => {
    expect(payProblem({ ...ok, salaryMin: 200, salaryMax: 200 }, ny)).toBeNull();
    expect(payProblem({ ...ok, salaryMin: 201, salaryMax: 200 }, NO_PAY_LAW)).toMatch(/minimum pay must not be more than the maximum/);
  });

  it('where the law bans it the pay-history question is refused; elsewhere it is the company choice', () => {
    expect(payProblem({ ...ok, askPayHistory: true }, ny)).toMatch(/bans asking applicants/);
    expect(payProblem({ ...ok, askPayHistory: true }, NO_PAY_LAW)).toBeNull();
  });

  it('where the law requires it the range cannot be hidden and a public job needs both ends', () => {
    expect(payProblem({ ...ok, showSalary: false }, ny)).toMatch(/cannot be hidden/);
    expect(payProblem({ ...ok, salaryMax: null }, ny)).toMatch(/requires a pay range before the job is published/);
    expect(payProblem({ ...ok, salaryMax: null, isPublic: false }, ny)).toBeNull();
    expect(payProblem({ ...ok, salaryMin: null, salaryMax: null, showSalary: false }, NO_PAY_LAW)).toBeNull();
  });
});
