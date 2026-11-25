import { contractLimitProblem, latestContractEnd } from './contract-limit';

describe('fixed-term contract limit (PPL-49, contract.max_years)', () => {
  it('ends the day before the same date N years on', () => {
    expect(latestContractEnd('2024-04-01', '3')).toBe('2027-03-31');
    expect(latestContractEnd('2025-01-15', '1')).toBe('2026-01-14');
  });

  it('a 29 Feb joining ends on 28 Feb', () => {
    expect(latestContractEnd('2024-02-29', '3')).toBe('2027-02-28');
    expect(latestContractEnd('2024-02-29', '4')).toBe('2028-02-28');
  });

  it('no limit when the company says none', () => {
    expect(latestContractEnd('2024-04-01', 'none')).toBeNull();
    expect(contractLimitProblem('2024-04-01', '2040-01-01', 'none')).toBeNull();
  });

  it('the last allowed day passes; one day later is refused with the latest end', () => {
    expect(contractLimitProblem('2024-04-01', '2027-03-31', '3')).toBeNull();
    expect(contractLimitProblem('2024-04-01', '2027-04-01', '3')).toBe('The new end is after the 3-year limit for fixed-term contracts. The latest end is 31 Mar 2027; make them permanent instead, or HR changes the limit in Settings.');
  });
});
