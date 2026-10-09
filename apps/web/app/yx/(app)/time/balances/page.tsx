'use client';

import { LeaveBalancesScreen, type HrBalances, type LedgerRow } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Leave balances (TIM-21 / TIM-30 basic): leave.view in scope; adjusting needs leave.balance.adjust and a reason.
export default function YxLeaveBalancesPage() {
  const balances = useTime<HrBalances>('/hr/balances');
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <LeaveBalancesScreen
      state={timeState(balances)}
      onRetry={() => void balances.refetch()}
      data={balances.data ?? null}
      onLedger={(employeeId) => read<LedgerRow[]>(`/people/${id(employeeId)}/ledger`)}
      onAdjust={(employeeId, input) => write(`/people/${id(employeeId)}/adjust`, 'POST', input)}
    />
  );
}
