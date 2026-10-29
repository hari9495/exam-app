'use client';

import { PayrollSetupScreen } from '@yukthix/ui/pay';
import { usePaySetupLive } from '../../../../../lib/yx-pay-setup';

// Payroll › Set-up (PAY-16 / CMP-02, PAY-2.04): statutory registrations and dated legal options. The designed PAY-16 set-up wizard, opened at this step.
export default function YxPaySetupPage() {
  return <PayrollSetupScreen live={usePaySetupLive('reg')} />;
}
