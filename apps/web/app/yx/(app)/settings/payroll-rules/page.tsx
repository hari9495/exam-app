import { redirect } from 'next/navigation';

// Settings S-7 (answers 1321, 1521): Payroll rules is retired; its bonus, loan and reports-access settings are on 4.6
// Loans & advances, where a change waits for a second person. The old address opens 4.6.
export default function YxPayrollRulesPage() {
  redirect('/yx/settings/payroll/loans-and-advances');
}
