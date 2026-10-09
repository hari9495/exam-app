'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PayPeriodsScreen, type PayPeriods, type PeriodHistory } from '@yukthix/ui/pay';
import { payState, usePay, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Pay periods (P08, PAY-1.02): stages per legal entity and month; asking to reopen needs a fresh second step.
export default function YxPayPeriodsPage() {
  const router = useRouter();
  const [year, setYear] = useState(todayIndia().slice(0, 4));
  const periods = usePay<PayPeriods>(`/periods?year=${year}`);
  const read = usePayRead();
  const write = usePayWrite();
  return (
    <PayPeriodsScreen
      state={payState(periods)}
      onRetry={() => void periods.refetch()}
      data={periods.data ?? null}
      year={year}
      onYear={setYear}
      onHistory={(id) => read<PeriodHistory>(`/periods/${encodeURIComponent(id)}`)}
      onAskReopen={(legalEntityId, month, reason) => write('/reopen-requests', { legalEntityId, month, reason })}
      onOpenRequests={() => router.push('/yx/payroll/reopen-requests')}
    />
  );
}
