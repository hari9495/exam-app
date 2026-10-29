'use client';

import { MyEquityScreen, type GrantView } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Me › My equity (PAY-9.09): the designed PAY-58 screen with the person's grants, vesting and exercising vested units.
export default function YxMyEquityPage() {
  const grants = usePay<GrantView[]>('/me/equity');
  const write = usePayWrite();
  return <MyEquityScreen live={{ state: payState(grants), onRetry: () => void grants.refetch(), data: grants.data ?? null, onExercise: (grantId, units) => write('/me/equity/exercises', { grantId, units }) }} />;
}
