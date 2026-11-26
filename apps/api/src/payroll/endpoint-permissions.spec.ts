import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { Payroll5bController } from './payroll-5b.controller';
import { Payroll5cController } from './payroll-5c.controller';
import { Payroll5dController } from './payroll-5d.controller';
import { Payroll5gController } from './payroll-5g.controller';
import { Payroll5iController } from './payroll-5i.controller';
import { Payroll5iMoreController } from './payroll-5i-more.controller';
import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollController } from './payroll.controller';
import { TaxController } from './tax.controller';

// YX-SEC-01 for Payroll: every payroll route declares its key. The only exceptions are routes about a person's own pay
// or own request, where the service decides per record (self, or the key in scope), listed here by name with the reason. A new route without a key fails this test until it is declared or listed.
const SELF: Record<string, string[]> = {
  // A person's own pay, or employee.salary.view over them (checked in the service).
  Payroll5bController: ['compensation', 'compensationHistory'],
  // An employee's own loans and loan request, own payslip; payroll.loan.manage / run keys in scope add others (service).
  Payroll5cController: ['loanRepayments', 'loanRules', 'loans', 'payslip', 'requestLoan'],
  // An employee's own payslips, PDF and single-use links, home pay card and payslip queries; payroll.query.handle adds
  // the entities' queries (service). yearLink (T2-B 65): one zip of the person's own payslips of a tax year.
  Payroll5dController: ['download', 'homePay', 'mySlips', 'openLink', 'pdf', 'queries', 'raise', 'updateQuery', 'yearLink'],
  // An employee's own recovery plans and their answer.
  Payroll5gController: ['answer', 'mine'],
  // An employee's own incentive statement.
  Payroll5iController: ['myIncentives'],
  // An employee's own earned wage access (own equity has its key, payroll.equity.own: PAY-58).
  Payroll5iMoreController: ['myDraw', 'myEwa'],
  // PAY-25: the person's own request for payroll reports access (the service refuses acting for someone else).
  PayrollReportsController: ['myAccessRequest', 'requestAccess'],
  // An employee's own pay documents and late corrections.
  PayrollController: ['documentFile', 'lateCorrection', 'mine'],
  // An employee's own tax workspace (tax/me/*): regime, declarations, proofs, Form 12B, residency, PAN link, certificates.
  TaxController: ['compare', 'declarations', 'declare', 'myCertificates', 'myForm12b', 'myPartA', 'myWorkspace', 'patchWorkspace', 'proof', 'requestPanLink', 'requestRegime', 'requestResidency', 'submitForm12b', 'taxSheet'],
};

describe('every payroll endpoint declares a permission (YX-SEC-01)', () => {
  for (const controller of [Payroll5bController, Payroll5cController, Payroll5dController, Payroll5gController, Payroll5iController, Payroll5iMoreController, PayrollReportsController, PayrollController, TaxController]) {
    it(`${controller.name}`, () => {
      const proto = controller.prototype as unknown as Record<string, unknown>;
      const handlers = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && typeof proto[m] === 'function' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined);
      expect(handlers.length).toBeGreaterThan(0);
      const undeclared = handlers.filter((m) => !Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object)?.length && !Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[m] as object)?.length);
      expect(undeclared.sort()).toEqual([...SELF[controller.name]].sort());
    });
  }
});
