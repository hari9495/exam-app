'use client';

import { LeaveReportsScreen, type HrBalances, type LedgerRow } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

const id = encodeURIComponent;

// Leave reports (TIM-30 balances, the designed screen) with each person's leave card (TIM-21): leave.view in scope;
// adjusting needs leave.balance.adjust and a reason.
export default function YxLeaveBalancesPage() {
  const sp = useScopeParams();
  const balances = useTime<HrBalances>(withParams('/hr/balances', sp.entity));
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <LeaveReportsScreen
      live={{
        state: timeState(balances),
        onRetry: () => void balances.refetch(),
        data: balances.data ?? null,
        today: todayIndia(),
        onLedger: (employeeId) => read<LedgerRow[]>(`/people/${id(employeeId)}/ledger`),
        onAdjust: (employeeId, input) => write(`/people/${id(employeeId)}/adjust`, 'POST', input),
      }}
    />
  );
}
