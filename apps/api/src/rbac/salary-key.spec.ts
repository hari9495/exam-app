import { isSalaryKey } from './permissions.guard';

describe('isSalaryKey (batch B item 1: which routes are salary pages)', () => {
  it.each(['employee.salary.view', 'employee.salary.manage', 'pay.range.view', 'payroll.run.view', 'payroll.period.view', 'payroll.bankfile.release'])('%s is a salary key', (k) => {
    expect(isSalaryKey(k)).toBe(true);
  });
  it.each(['payroll.equity.own', 'payroll.query.handle', 'expense.claim.approve', 'employee.profile.view', 'audit.view', 'payrollx.view'])('%s is not', (k) => {
    expect(isSalaryKey(k)).toBe(false);
  });
});
