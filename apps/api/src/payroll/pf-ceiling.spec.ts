import { inForce, pf, pt } from '../statutory/evaluator';
import { RULES } from './regression/fixtures';
import { staleRuleUses } from './arrears.service';

// The PF wage ceiling is a dated rule value (S.O. 5109(E)): 15,000 for periods ending before 17 Sep 2026 and 25,000 from
// then; verify stays on until the CA confirms. Greater Chennai PT moves to August and January from Oct 2026.
describe('dated PF ceiling (17 Sep 2026)', () => {
  const pfOn = (on: string) => inForce(RULES, 'IN.PF', ['IN'], on)!;

  it('a period ending 14 Sep uses 15,000; one ending 20 Sep uses 25,000 (still to verify)', () => {
    expect(pfOn('2026-09-14').values).toMatchObject({ wageCeiling: '15000', epsCeiling: '15000' });
    expect(pfOn('2026-09-16').version).toBe('2025-v1');
    expect(pfOn('2026-09-17').version).toBe('2026-v2');
    expect(pfOn('2026-09-20')).toMatchObject({ verify: true, values: expect.objectContaining({ wageCeiling: '25000', epsCeiling: '25000' }) });
  });

  it('basic 30,000: employee PF 1,800 and EPS 1,250 before; 3,000 and 2,083 after', () => {
    const at = (on: string) => pf(pfOn(on), { pfWage: '30000', onActualWage: false, age: 30 });
    expect([at('2026-09-14').employee.toFixed(0), at('2026-09-14').eps.toFixed(0)]).toEqual(['1800', '1250']);
    expect([at('2026-09-20').employee.toFixed(0), at('2026-09-20').eps.toFixed(0)]).toEqual(['3000', '2083']);
  });

  it('negative: below both ceilings nothing changes; EDLI keeps its 15,000 ceiling until the CA confirms (item 46)', () => {
    const at = (on: string, w: string) => pf(pfOn(on), { pfWage: w, onActualWage: false, age: 30 });
    expect(at('2026-09-14', '12000').employee.toFixed(0)).toBe(at('2026-09-20', '12000').employee.toFixed(0));
    expect(at('2026-09-20', '30000').edli.toFixed(0)).toBe('75');
    expect(pfOn('2026-09-20').values.edliCeiling).toBe('15000');
  });

  it('arrears proposals: a payslip ending 20 Sep paid on 15,000 is proposed; one ending 14 Sep is not', () => {
    const used = { 'IN.PF|IN': '2025-v1' };
    const slips = [
      { employeeId: 'a', month: '2026-09', ruleVersions: used, on: '2026-09-14' },
      { employeeId: 'b', month: '2026-09', ruleVersions: used, on: '2026-09-20' },
      { employeeId: 'c', month: '2026-08', ruleVersions: used },
    ];
    expect(staleRuleUses(slips, RULES).filter((x) => x.statute === 'IN.PF')).toEqual([{ statute: 'IN.PF', jurisdiction: 'IN', version: '2026-v2', periods: ['2026-09'], employees: ['b'] }]);
  });
});

describe('Greater Chennai PT in August and January (from the October 2026 half-year)', () => {
  const tn = (on: string) => inForce(RULES, 'IN.PT', ['IN-TN'], on)!;
  it('deducts in January and August; not in March or September any more', () => {
    expect(pt(tn('2027-01-31'), { ptWage: '180000', month: 1 }).amount.toFixed(0)).toBe('1250');
    expect(pt(tn('2027-03-31'), { ptWage: '180000', month: 3 }).amount.toFixed(0)).toBe('0');
    expect(pt(tn('2027-08-31'), { ptWage: '40000', month: 8 }).amount.toFixed(0)).toBe('425');
  });
  it('negative: the half-year already deducted in September 2026 stays as it was', () => {
    expect(tn('2026-09-30').version).toBe('2024-v1');
    expect(pt(tn('2026-09-30'), { ptWage: '180000', month: 9 }).amount.toFixed(0)).toBe('1250');
  });
});
