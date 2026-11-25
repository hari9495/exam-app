import { OVER_SPLIT, splitAmounts, splitProblem, splitText, type SplitLine } from './pay-split';

const L = (account: SplitLine['account'], rule: SplitLine['rule'], value = 0): SplitLine => ({ account, rule, value });
const amounts = (net: string, lines: SplitLine[], strict = true) => {
  const r = splitAmounts(net, lines, strict);
  return r.ok ? Object.fromEntries(r.amounts.map((a) => [a.account, a.amount.toFixed(2)])) : r.error;
};

describe('PPL-46 split pay', () => {
  it('fixed first, then a percentage of what is left, the remainder to one account (the design: 49,812)', () => {
    expect(amounts('49812', [L('abroad', 'remainder'), L('salary', 'fixed', 2500), L('reimbursement', 'percent', 10)])).toEqual({ abroad: '42580.80', salary: '2500.00', reimbursement: '4731.20' });
  });

  it('one account with the remainder takes the whole net pay', () => {
    expect(amounts('30000.50', [L('abroad', 'remainder')])).toEqual({ abroad: '30000.50' });
  });

  it('a split exactly equal to the net pay is fine; one rupee more is refused with the designed message', () => {
    expect(amounts('10000', [L('salary', 'remainder'), L('abroad', 'fixed', 10000)])).toEqual({ salary: '0.00', abroad: '10000.00' });
    expect(amounts('10000', [L('salary', 'remainder'), L('abroad', 'fixed', 10001)])).toBe(OVER_SPLIT);
    expect(amounts('49812', [L('salary', 'remainder'), L('abroad', 'fixed', 45000), L('reimbursement', 'fixed', 5000)])).toBe(OVER_SPLIT);
  });

  it('on pay day a lower net is never refused: fixed amounts as far as the net goes, the remainder gets what is left', () => {
    expect(amounts('3000', [L('salary', 'remainder'), L('abroad', 'fixed', 2500), L('reimbursement', 'fixed', 1000)], false)).toEqual({ salary: '0.00', abroad: '2500.00', reimbursement: '500.00' });
  });

  it('shape rules: 1 to 3 accounts, each once, exactly one remainder, sensible values', () => {
    expect(splitProblem([])).toMatch(/1 to 3/);
    expect(splitProblem([L('salary', 'remainder'), L('salary', 'fixed', 1)])).toMatch(/once/);
    expect(splitProblem([L('salary', 'fixed', 1), L('abroad', 'fixed', 1)])).toMatch(/exactly one/);
    expect(splitProblem([L('salary', 'remainder'), L('abroad', 'remainder')])).toMatch(/exactly one/);
    expect(splitProblem([L('salary', 'remainder'), L('abroad', 'fixed', 0)])).toMatch(/fixed amount/);
    expect(splitProblem([L('salary', 'remainder'), L('abroad', 'percent', 100)])).toMatch(/less than 100/);
    expect(splitProblem([L('salary', 'remainder'), L('abroad', 'percent', 99.5)])).toBeNull();
  });

  it('says the split in words', () => {
    expect(splitText([L('abroad', 'remainder'), L('salary', 'fixed', 2500), L('reimbursement', 'percent', 10)])).toBe('Account abroad: the rest; Salary account: ₹2,500; Reimbursement account: 10%');
  });
});
