'use client';

import { MyEquityScreen, type GrantView } from '@yukthix/ui/pay';
import { usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Me › My equity (PAY-9.09): grants, vesting and exercising vested units.
export default function YxMyEquityPage() {
  const grants = usePay<GrantView[]>('/me/equity');
  const write = usePayWrite();
  return <MyEquityScreen data={grants.data ?? null} onExercise={(grantId, units) => write('/me/equity/exercises', { grantId, units })} />;
}
