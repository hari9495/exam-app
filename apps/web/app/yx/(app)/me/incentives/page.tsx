'use client';

import { MyIncentivesScreen, type MyIncentives } from '@yukthix/ui/pay';
import { usePay } from '../../../../../lib/yx-pay';

// Me › My incentives (PAY-9.06, PAY-33): the person's incentive results and clawbacks.
export default function YxMyIncentivesPage() {
  const data = usePay<MyIncentives>('/special/me/incentives');
  return <MyIncentivesScreen data={data.data ?? null} />;
}
