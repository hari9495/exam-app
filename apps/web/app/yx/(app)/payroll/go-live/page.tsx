'use client';

import { PayrollSetupScreen } from '@yukthix/ui/pay';
import { usePaySetupLive } from '../../../../../lib/yx-pay-setup';

// Payroll › Go-live (PAY-16 Go-live step, PAY-10.07): readiness and the parallel run. The designed PAY-16 set-up wizard, opened at this step.
export default function YxPayGoLivePage() {
  return <PayrollSetupScreen live={usePaySetupLive('golive')} />;
}
