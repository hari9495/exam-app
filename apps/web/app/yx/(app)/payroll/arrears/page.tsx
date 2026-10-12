'use client';

import { ArrearsScreen, type Recovery, type Worksheet } from '@yukthix/ui/pay';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';

// Payroll › Arrears and recoveries (PAY-10.04, PAY-28, PAY-19): worksheets, base confirmation, approval, write-offs.
export default function YxPayArrearsPage() {
  const perms = useYxPermissions();
  const me = useCurrentUser();
  const sheets = usePay<Worksheet[]>('/arrears-worksheets');
  const recoveries = usePay<Recovery[]>('/overpayments');
  const write = usePayWrite();
  const nameOf = useNames();
  return (
    <ArrearsScreen
      state={payState(sheets)}
      onRetry={() => void sheets.refetch()}
      worksheets={sheets.data ?? null}
      recoveries={recoveries.data ?? (recoveries.isError ? [] : null)}
      nameOf={nameOf}
      me={me.data?.id ?? null}
      can={{ approve: perms.has('payroll.arrears.approve'), writeOff: perms.has('payroll.writeoff.approve') }}
      onApprove={(w, runId) => write(`/arrears-worksheets/${encodeURIComponent(w.id)}/approve`, runId ? { runId } : {})}
      onCancel={(w) => write(`/arrears-worksheets/${encodeURIComponent(w.id)}/cancel`)}
      onConfirmBase={(w, period, lines, reason) => write(`/arrears-worksheets/${encodeURIComponent(w.id)}/confirm-base`, { period, lines, reason })}
      onWriteOff={(r, reason) => write(`/overpayments/${encodeURIComponent(r.id)}/write-off`, { reason })}
    />
  );
}
