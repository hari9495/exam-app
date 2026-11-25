'use client';

import { IncentiveStatementScreen, type MyIncentives } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';

// Me › My incentives (PAY-33): the person's incentive results, what went to payroll, and clawbacks.
export default function YxMyIncentivesPage() {
  const data = usePay<MyIncentives>('/special/me/incentives');
  return <IncentiveStatementScreen live={{ state: payState(data), onRetry: () => void data.refetch(), data: data.data ?? null }} />;
}
