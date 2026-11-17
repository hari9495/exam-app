import { PermissionsGuard } from '../../src/rbac/permissions.guard';

// Why salary and payroll routes pass in e2e without a "Confirm it's you": this fixture skips the salary re-check
// (PermissionsGuard.checkSalaryRecheck) in every suite unless the suite turns it back on.
// Batch B item 1: the salary re-check ("Confirm it's you" before salary pages) is proven by
// batch-b-salary-recheck.e2e-spec.ts, which calls enableSalaryRecheck(). Every other suite signs payroll users in
// without it, as before; their own step-up rules (@RequireStepUp, assertStepUp) are untouched and still tested.
const real = PermissionsGuard.prototype.checkSalaryRecheck;
PermissionsGuard.prototype.checkSalaryRecheck = async function () {};

export function enableSalaryRecheck(): void {
  PermissionsGuard.prototype.checkSalaryRecheck = real;
}
