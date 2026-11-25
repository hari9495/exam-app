'use client';

import { PayrollSetupScreen } from '@yukthix/ui/pay';
import { usePaySetupLive } from '../../../../../lib/yx-pay-setup';

// Payroll › Imports (PAY-16 Opening balances, PAY-2.12): staged CSV per kind, commit, the go-live check. The designed PAY-16 set-up wizard, opened at this step.
export default function YxPayImportsPage() {
  return <PayrollSetupScreen live={usePaySetupLive('opening')} />;
}
