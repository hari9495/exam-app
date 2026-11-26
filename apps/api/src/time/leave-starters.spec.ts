import { LEAVE_STARTERS } from './setup.service';
import { parseLines, parseRules } from './time-core';
import { statutoryProblem } from './leave-rules';

// Answer 2754: every starter must pass the same checks as a type HR makes by hand.
describe('starter leave types (answer 2754)', () => {
  it('has the seven starters the founder chose, with the agreed days', () => {
    expect(LEAVE_STARTERS.map((s) => s.key)).toEqual(['casual', 'sick', 'earned', 'maternity', 'paternity', 'comp_off', 'lwp']);
    const by = Object.fromEntries(LEAVE_STARTERS.map((s) => [s.key, s]));
    expect(by.casual.line?.annualDays).toBe(12);
    expect(by.sick.line?.annualDays).toBe(12);
    expect(by.earned.line).toMatchObject({ annualDays: 15, carryForwardMax: 30 });
    expect(by.maternity.rules.maxDays).toBe(26 * 7);
    expect(by.paternity.rules.maxDays).toBe(5);
    expect(by.lwp).toMatchObject({ kind: 'lop', paid: false });
  });

  it('each starter passes the rules check, the law check and the policy line check', () => {
    const ids = new Set(LEAVE_STARTERS.map((_, i) => `00000000-0000-4000-8000-00000000000${i}`));
    for (const [i, s] of LEAVE_STARTERS.entries()) {
      const rules = parseRules(s.rules);
      const min = s.kind === 'maternity' ? { law: 'Maternity Benefit Act 1961', days: 182, paidInFull: true } : null;
      expect(statutoryProblem(min, { name: s.name, paid: s.paid, active: true, rules })).toBeNull();
      if (s.line) expect(() => parseLines([{ leaveTypeId: `00000000-0000-4000-8000-00000000000${i}`, ...s.line }], ids)).not.toThrow();
    }
  });

  it('negative: a maternity starter made unpaid or shorter than the law is refused', () => {
    const m = LEAVE_STARTERS.find((s) => s.key === 'maternity')!;
    const min = { law: 'Maternity Benefit Act 1961', days: 182, paidInFull: true };
    expect(statutoryProblem(min, { name: m.name, paid: false, active: true, rules: parseRules(m.rules) })).toMatch(/paid by law/);
    expect(statutoryProblem(min, { name: m.name, paid: true, active: true, rules: parseRules({ ...m.rules, maxDays: 90 }) })).toMatch(/can't be below 182/);
  });

  it('codes are unique and valid leave type codes', () => {
    const codes = LEAVE_STARTERS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z][A-Z0-9]{0,7}$/);
  });
});
