import { isBic, isIban, splitProblem } from './bank-check';
import { fyOf, tradingDaysEnd } from './compliance.service';

describe('international bank checks (PPL-46)', () => {
  it('IBAN: country length and mod-97 check digits; BIC: 8 or 11 characters', () => {
    expect(isIban('AE07 0331 2345 6789 0123 456')).toBe(true);
    expect(isIban('AE07 0331 2345 6789 0123 457')).toBe(false);
    expect(isIban('AE07 0331 2345 6789 0123')).toBe(false);
    expect(isIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isIban('XX82 WEST 1234 5698 7654 32')).toBe(false);
    expect(isBic('ECBKAEAD')).toBe(true);
    expect(isBic('ecbkaeadxxx')).toBe(true);
    expect(isBic('ECB1')).toBe(false);
  });

  it('split: up to 3 accounts, one remainder, sane amounts, never more than the net', () => {
    expect(splitProblem([{ rule: 'remainder', value: 0 }, { rule: 'fixed', value: 2500 }, { rule: 'percent', value: 10 }], 49812)).toBeNull();
    expect(splitProblem([])).toBe('Add at least one account.');
    expect(splitProblem([{ rule: 'fixed', value: 1 }])).toBe('One account takes the remainder: the primary one.');
    expect(splitProblem([{ rule: 'remainder', value: 0 }, { rule: 'remainder', value: 0 }])).toBe('One account takes the remainder: the primary one.');
    expect(splitProblem([{ rule: 'remainder', value: 0 }, { rule: 'percent', value: 60 }, { rule: 'percent', value: 50 }])).toBe('The percentages add up to more than 100.');
    expect(splitProblem([{ rule: 'remainder', value: 0 }, { rule: 'fixed', value: 45000 }, { rule: 'fixed', value: 9000 }], 49812)).toBe('The fixed amounts are more than the net pay.');
    expect(splitProblem(Array.from({ length: 4 }, (_, i) => ({ rule: i ? ('fixed' as const) : ('remainder' as const), value: 1 })))).toBe('Use up to 3 accounts.');
  });
});

describe('BFSI dates (PPL-43, PPL-44)', () => {
  it('financial year and 7 trading days', () => {
    expect(fyOf('2026-10-21')).toBe('2026-27');
    expect(fyOf('2027-03-31')).toBe('2026-27');
    expect(fyOf('2027-04-01')).toBe('2027-28');
    // Wednesday 21 Oct 2026 + 7 trading days (the first counts): Thursday 29 Oct.
    expect(tradingDaysEnd('2026-10-21', 7)).toBe('2026-10-29');
    // From a Saturday the first trading day is Monday.
    expect(tradingDaysEnd('2026-10-24', 1)).toBe('2026-10-26');
  });
});
