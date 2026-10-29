'use client';

import { PayrollSetupScreen } from '@yukthix/ui/pay';
import { usePaySetupLive } from '../../../../../lib/yx-pay-setup';

// Payroll › Pay groups (PAY-16 Pay group step, PAY-2.05): groups, members from a date, the pay calendar. The designed PAY-16 set-up wizard, opened at this step.
export default function YxPayPayGroupsPage() {
  return <PayrollSetupScreen live={usePaySetupLive('group')} />;
}
