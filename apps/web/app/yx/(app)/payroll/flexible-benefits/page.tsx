'use client';

import { useState } from 'react';
import { FlexSettlementScreen, type FlexLedgerView, type FlexOverview, type FlexSettleResult } from '@yukthix/ui/pay';
import { payState } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import { flexYears } from '../../../../../lib/yx-flex';

// Payroll › Flexible benefits (PAY-60, answers 2455, 2459, 2460): the designed settlement screen. Everyone in the March
// pay month (the API refuses earlier), leavers at exit (started by itself at the F&F hand-off). payroll.input.manage over
// the legal entity; the API checks it again and never lets anyone settle their own.
export default function YxPayFlexBenefitsPage() {
  const { accessToken } = useAuth();
  const years = flexYears();
  const [year, setYear] = useState(years[0]);
  const e = encodeURIComponent;
  const data = useApi<FlexOverview>(`/benefits/flex/settlements?taxYear=${e(year)}`);
  const write = useApiWrite();
  const settle = async (body: object) => {
    const r = await write<FlexSettleResult>('/benefits/flex/settlements', { taxYear: year, ...body });
    await data.refetch();
    return r;
  };
  return (
    <FlexSettlementScreen
      live={{
        state: payState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        years,
        year,
        onYear: setYear,
        onSettleYear: () => settle({ kind: 'year_end' }),
        onSettleExit: (employeeId) => settle({ kind: 'exit', employeeId }),
        onLedger: (employeeId) => apiFetch(`/benefits/flex/ledger/${e(employeeId)}?taxYear=${e(year)}`, {}, accessToken ?? undefined) as Promise<FlexLedgerView>,
      }}
    />
  );
}
