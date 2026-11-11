import { holdFor } from './containment';

// Answer 1050: which requests a contained company is refused. Matching is by method and path (after /api/v1).
describe('containment holds', () => {
  it.each([
    ['GET', '/payroll/audit/export', 'export'],
    ['POST', '/payroll/runs/r1/journal/export', 'export'],
    ['GET', '/staffing/exports', 'export'],
    ['POST', '/payroll/runs/r1/bank-files', 'payout'],
    ['POST', '/payroll/bank-files/b1/release', 'payout'],
    ['POST', '/payroll/runs/r1/disbursements', 'payout'],
    ['POST', '/payroll/payslips/p1/expedite-bank', 'payout'],
    ['POST', '/expenses/payouts', 'payout'],
    ['POST', '/expenses/payouts/x/release', 'payout'],
    ['GET', '/expenses/payouts/x/file', 'payout'],
    ['POST', '/payroll/consultant-payouts/x/release', 'payout'],
    ['POST', '/payroll/ewa/draws/d1/paid', 'payout'],
    ['PUT', '/portal/join/demo-org/sections/bank', 'bank'],
  ])('%s %s is held (%s)', (method, path, hold) => expect(holdFor(method, path)).toBe(hold));

  it.each([
    ['GET', '/payroll/runs/r1/bank-files'],
    ['GET', '/expenses/payouts/x'],
    ['GET', '/expenses/payouts'],
    ['GET', '/payroll/consultant-payouts'],
    ['GET', '/people/employees'],
    ['PUT', '/portal/join/demo-org/sections/emergency'],
    ['GET', '/help/containment'],
  ])('%s %s is not held', (method, path) => expect(holdFor(method, path)).toBeNull());
});
