import { TEMPLATE_HISTORY } from './role-template-history';
import { ROLE_TEMPLATES } from './role-templates';
import { templateOf, upgrade } from './template-sync.service';

// Role templates reach existing companies (P02 §4.2): unchanged copies are recognised by an exact match with a past or
// the current version of a template; a following role gains the template's new keys, never Confidential ones while held.

describe('role template sync', () => {
  const finance = ROLE_TEMPLATES.find((t) => t.key === 'finance_approver')!;
  const old = TEMPLATE_HISTORY.finance_approver.find((v) => !v.includes('expense.payout.manage'))!;

  it('the history knows the Finance Approver from before expenses paid claims', () => {
    expect(old).toBeDefined();
    expect(finance.permissions).toContain('expense.payout.manage');
  });

  it('an exact copy of a past version is that template; one key more or less is the company’s own role', () => {
    expect(templateOf([...old].reverse())).toEqual({ template: 'finance_approver', set: [...old].sort() });
    expect(templateOf([...old, 'company.own.key'])).toBeNull();
  });

  it('a following role gains the template’s new keys; Confidential ones are not added while people hold it', () => {
    const u = upgrade(old, finance.permissions, true);
    expect(u.granted).toContain('expense.payout.manage');
    expect(u.keys).toEqual(expect.arrayContaining(old));
    const conf = upgrade(['org:view'], ['org:view', 'employee.salary.view', 'audit.view'], true);
    expect(conf).toEqual({ granted: ['audit.view'], skipped: ['employee.salary.view'], keys: ['audit.view', 'org:view'] });
    expect(upgrade(['org:view'], ['org:view', 'employee.salary.view'], false).granted).toEqual(['employee.salary.view']);
  });

  it('HR Admin sees Special data (founder 27 Oct 2026); a held copy gets it through a second admin, an unheld one at once', () => {
    const hr = ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!;
    expect(hr.permissions).toContain('employee.aadhaar.view');
    const before = TEMPLATE_HISTORY.hr_admin.find((v) => !v.includes('employee.aadhaar.view') && v.includes('employee.identity.approve'))!;
    expect(templateOf(before)?.template).toBe('hr_admin');
    expect(upgrade(before, hr.permissions, true).skipped).toContain('employee.aadhaar.view');
    expect(upgrade(before, hr.permissions, false).granted).toContain('employee.aadhaar.view');
  });
});
